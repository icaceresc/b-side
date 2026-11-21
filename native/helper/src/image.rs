// Image decoding, scaling and JPEG encoding with Windows Imaging Component (WIC), the codecs that
// ship with Windows. Loaded on the first image only, so an idle helper does not carry them.
use std::cell::RefCell;

use windows::core::{w, GUID, PWSTR};
use windows::Win32::Graphics::Imaging::{
    CLSID_WICImagingFactory, GUID_ContainerFormatJpeg, GUID_WICPixelFormat24bppBGR, GUID_WICPixelFormat32bppPBGRA, IWICBitmapSource, IWICImagingFactory,
    WICBitmapDitherTypeNone, WICBitmapEncoderNoCache, WICBitmapInterpolationModeHighQualityCubic, WICBitmapPaletteTypeCustom, WICDecodeMetadataCacheOnDemand,
};
use windows::Win32::System::Com::StructuredStorage::{CreateStreamOnHGlobal, PROPBAG2};
use windows::Win32::System::Com::{CoCreateInstance, IStream, CLSCTX_INPROC_SERVER, STATFLAG_NONAME, STATSTG, STREAM_SEEK_SET};
use windows::Win32::System::Variant::{VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_R4};

thread_local! {
    static FACTORY: RefCell<Option<IWICImagingFactory>> = const { RefCell::new(None) };
}

fn factory() -> windows::core::Result<IWICImagingFactory> {
    FACTORY.with(|f| {
        if let Some(existing) = f.borrow().as_ref() {
            return Ok(existing.clone());
        }
        let made: IWICImagingFactory = unsafe { CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)? };
        *f.borrow_mut() = Some(made.clone());
        Ok(made)
    })
}

/// .NET's Math.Round: half to even.
fn scaled(side: u32, k: f64) -> u32 {
    ((f64::from(side) * k).round_ties_even() as u32).max(1)
}

/// The image scaled to at most `max_side` on its longest side (never enlarged), drawn over black
/// as 24-bit BGR, then encoded as JPEG at the first quality in `qualities` whose result is at most
/// `budget` bytes. Ok(None) when no quality fits; Err when the image cannot be decoded.
pub fn jpeg(data: &[u8], max_side: u32, qualities: &[u8], budget: usize) -> windows::core::Result<Option<Vec<u8>>> {
    unsafe {
        let f = factory()?;
        let input = f.CreateStream()?;
        input.InitializeFromMemory(data)?;
        let decoder = f.CreateDecoderFromStream(&input, std::ptr::null(), WICDecodeMetadataCacheOnDemand)?;
        let frame = decoder.GetFrame(0)?;
        let (mut w0, mut h0) = (0u32, 0u32);
        frame.GetSize(&mut w0, &mut h0)?;
        if w0 == 0 || h0 == 0 {
            return Ok(None);
        }
        let k = (f64::from(max_side) / f64::from(w0.max(h0))).min(1.0);
        let (w, h) = (scaled(w0, k), scaled(h0, k));
        let source: IWICBitmapSource = if (w, h) == (w0, h0) {
            frame.into()
        } else {
            let scaler = f.CreateBitmapScaler()?;
            scaler.Initialize(&frame, w, h, WICBitmapInterpolationModeHighQualityCubic)?;
            scaler.into()
        };
        // Premultiplied BGRA: dropping alpha leaves the picture composited over black.
        let converter = f.CreateFormatConverter()?;
        converter.Initialize(
            &source,
            &GUID_WICPixelFormat32bppPBGRA,
            WICBitmapDitherTypeNone,
            None,
            0.0,
            WICBitmapPaletteTypeCustom,
        )?;
        let stride4 = w as usize * 4;
        let mut bgra = vec![0u8; stride4 * h as usize];
        converter.CopyPixels(std::ptr::null(), stride4 as u32, &mut bgra)?;
        let stride3 = (w as usize * 3 + 3) & !3;
        let mut bgr = vec![0u8; stride3 * h as usize];
        for y in 0..h as usize {
            let (src, dst) = (&bgra[y * stride4..(y + 1) * stride4], &mut bgr[y * stride3..y * stride3 + w as usize * 3]);
            for (s, d) in src.as_chunks::<4>().0.iter().zip(dst.as_chunks_mut::<3>().0.iter_mut()) {
                d.copy_from_slice(&s[..3]);
            }
        }
        drop(bgra);
        let bitmap = f.CreateBitmapFromMemory(w, h, &GUID_WICPixelFormat24bppBGR, stride3 as u32, &bgr)?;
        for &q in qualities {
            let out = encode(&f, &bitmap.clone().into(), w, h, f32::from(q) / 100.0)?;
            if out.len() <= budget {
                return Ok(Some(out));
            }
        }
        Ok(None)
    }
}

unsafe fn encode(f: &IWICImagingFactory, source: &IWICBitmapSource, w: u32, h: u32, quality: f32) -> windows::core::Result<Vec<u8>> {
    unsafe {
        let stream: IStream = CreateStreamOnHGlobal(Default::default(), true)?;
        let encoder = f.CreateEncoder(&GUID_ContainerFormatJpeg, std::ptr::null())?;
        encoder.Initialize(&stream, WICBitmapEncoderNoCache)?;
        let mut frame = None;
        let mut options = None;
        encoder.CreateNewFrame(&mut frame, &mut options)?;
        let frame = frame.ok_or_else(windows::core::Error::empty)?;
        let options = options.ok_or_else(windows::core::Error::empty)?;
        let name = w!("ImageQuality");
        let bag = PROPBAG2 {
            pstrName: PWSTR(name.as_ptr() as *mut u16),
            ..Default::default()
        };
        let value = VARIANT {
            Anonymous: VARIANT_0 {
                Anonymous: std::mem::ManuallyDrop::new(VARIANT_0_0 {
                    vt: VT_R4,
                    Anonymous: VARIANT_0_0_0 { fltVal: quality },
                    ..Default::default()
                }),
            },
        };
        options.Write(1, &bag, &value)?;
        frame.Initialize(&options)?;
        frame.SetSize(w, h)?;
        let mut format: GUID = GUID_WICPixelFormat24bppBGR;
        frame.SetPixelFormat(&mut format)?;
        frame.WriteSource(source, std::ptr::null())?;
        frame.Commit()?;
        encoder.Commit()?;
        let mut stat = STATSTG::default();
        stream.Stat(&mut stat, STATFLAG_NONAME)?;
        let mut out = vec![0u8; stat.cbSize as usize];
        stream.Seek(0, STREAM_SEEK_SET, None)?;
        let mut read = 0u32;
        stream.Read(out.as_mut_ptr() as *mut _, out.len() as u32, Some(&mut read)).ok()?;
        out.truncate(read as usize);
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bmp(w: u32, h: u32) -> Vec<u8> {
        // A 24-bit bottom-up BMP of one colour.
        let stride = (w * 3 + 3) & !3;
        let size = 54 + stride * h;
        let mut b = Vec::new();
        b.extend_from_slice(b"BM");
        b.extend_from_slice(&size.to_le_bytes());
        b.extend_from_slice(&[0; 4]);
        b.extend_from_slice(&54u32.to_le_bytes());
        b.extend_from_slice(&40u32.to_le_bytes());
        b.extend_from_slice(&(w as i32).to_le_bytes());
        b.extend_from_slice(&(h as i32).to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&24u16.to_le_bytes());
        b.extend_from_slice(&[0; 24]);
        for _ in 0..h {
            for x in 0..stride {
                b.push(if x < w * 3 { [30, 80, 200][(x % 3) as usize] } else { 0 });
            }
        }
        b
    }

    fn sof(jpeg: &[u8]) -> (u16, u16) {
        let i = jpeg.windows(2).position(|p| p == [0xFF, 0xC0]).expect("SOF0");
        (u16::from_be_bytes([jpeg[i + 7], jpeg[i + 8]]), u16::from_be_bytes([jpeg[i + 5], jpeg[i + 6]]))
    }

    #[test]
    fn scales_down_never_up_and_encodes_jpeg() {
        unsafe {
            let _ = windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_MULTITHREADED);
        }
        let out = jpeg(&bmp(1200, 900), 256, &[88, 78], 200 * 1024).unwrap().unwrap();
        assert_eq!(&out[..3], &[0xFF, 0xD8, 0xFF]);
        assert_eq!(sof(&out), (256, 192));
        let small = jpeg(&bmp(100, 50), 800, &[88], 200 * 1024).unwrap().unwrap();
        assert_eq!(sof(&small), (100, 50));
        assert_eq!(jpeg(&bmp(100, 50), 800, &[88], 10).unwrap(), None);
        assert!(jpeg(b"not an image", 256, &[88], 200 * 1024).is_err());
    }
}
