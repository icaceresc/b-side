// JSON text and the argument conversions of the PowerShell helper ([int], [long], [bool], [string]
// casts on the parsed request), so both helpers read a request the same way.
use crate::Failure;
use serde_json::Value;

/// A JSON string literal ("null" for None): quotes and backslashes escaped, control characters as
/// \uXXXX, everything else as is (UTF-8).
pub fn esc(s: Option<&str>) -> String {
    let Some(s) = s else { return "null".to_string() };
    let mut b = String::with_capacity(s.len() + 2);
    b.push('"');
    for c in s.chars() {
        match c {
            '"' | '\\' => {
                b.push('\\');
                b.push(c);
            }
            c if (c as u32) < 0x20 => b.push_str(&format!("\\u{:04x}", c as u32)),
            c => b.push(c),
        }
    }
    b.push('"');
    b
}

static NULL: Value = Value::Null;

/// A property of a request, by name ignoring case, as PowerShell reads ConvertFrom-Json objects;
/// null when it is missing or `v` is not an object.
pub fn field<'a>(v: &'a Value, name: &str) -> &'a Value {
    match v {
        Value::Object(map) => map
            .get(name)
            .or_else(|| map.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v))
            .unwrap_or(&NULL),
        _ => &NULL,
    }
}

/// A number written in a string, as PowerShell converts it: decimal, or hexadecimal with 0x.
fn parse_number(s: &str) -> Option<f64> {
    let s = s.trim();
    let (neg, body) = match s.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, s.strip_prefix('+').unwrap_or(s)),
    };
    let x = match body.strip_prefix("0x").or_else(|| body.strip_prefix("0X")) {
        Some(hex) if !hex.is_empty() => i64::from_str_radix(hex, 16).ok()? as f64,
        Some(_) => return None,
        None if body.chars().all(|c| c.is_ascii_digit() || ".eE+-".contains(c)) => body.parse::<f64>().ok()?,
        None => return None,
    };
    Some(if neg { -x } else { x })
}

fn number(v: &Value, min: f64, max: f64, type_name: &str) -> Result<f64, Failure> {
    let bad = || Failure::error(format!("Cannot convert value \"{v}\" to type \"{type_name}\""));
    let x = match v {
        Value::Null => 0.0,
        Value::Bool(b) => f64::from(u8::from(*b)),
        Value::Number(n) => {
            // Integers keep their exact value; only fractions round.
            if let Some(i) = n.as_i64() {
                return if (i as f64) >= min && (i as f64) <= max { Ok(i as f64) } else { Err(bad()) };
            }
            n.as_f64().ok_or_else(bad)?
        }
        Value::String(s) if s.trim().is_empty() => 0.0,
        Value::String(s) => parse_number(s).ok_or_else(bad)?,
        _ => return Err(bad()),
    };
    // .NET's conversion rounds half to even.
    let r = x.round_ties_even();
    if r.is_finite() && r >= min && r <= max {
        Ok(r)
    } else {
        Err(bad())
    }
}

pub fn ps_int(v: &Value) -> Result<i32, Failure> {
    number(v, i32::MIN as f64, i32::MAX as f64, "System.Int32").map(|x| x as i32)
}

pub fn ps_long(v: &Value) -> Result<i64, Failure> {
    // A JSON integer keeps every digit; anything else goes through a double, as in PowerShell.
    if let Some(i) = v.as_i64() {
        return Ok(i);
    }
    number(v, i64::MIN as f64, i64::MAX as f64, "System.Int64").map(|x| x as i64)
}

/// PowerShell's truthiness: null, false, 0 and "" are false.
pub fn ps_bool(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|x| x != 0.0),
        Value::String(s) => !s.is_empty(),
        // One element counts as that element; more are true.
        Value::Array(a) => match a.as_slice() {
            [] => false,
            [one] => ps_bool(one),
            _ => true,
        },
        Value::Object(_) => true,
    }
}

/// [string] of a value: null is "".
pub fn ps_string(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Bool(true) => "True".to_string(),
        Value::Bool(false) => "False".to_string(),
        other => other.to_string(),
    }
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64(data: &[u8]) -> String {
    let mut s = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let n = (u32::from(chunk[0]) << 16) | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8) | u32::from(*chunk.get(2).unwrap_or(&0));
        s.push(B64[(n >> 18) as usize & 63] as char);
        s.push(B64[(n >> 12) as usize & 63] as char);
        s.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        s.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    s
}

/// Standard base64 with padding; white space is ignored, as .NET's Convert does.
pub fn unbase64(s: &str) -> Result<Vec<u8>, Failure> {
    let bad = || Failure::error("The input is not a valid Base-64 string");
    let chars: Vec<u8> = s.bytes().filter(|c| !c.is_ascii_whitespace()).collect();
    if !chars.len().is_multiple_of(4) {
        return Err(bad());
    }
    let mut out = Vec::with_capacity(chars.len() / 4 * 3);
    for (i, quad) in chars.chunks(4).enumerate() {
        let last = i == chars.len() / 4 - 1;
        let mut n = 0u32;
        let mut pad = 0;
        for (j, &c) in quad.iter().enumerate() {
            let v = match c {
                b'A'..=b'Z' => c - b'A',
                b'a'..=b'z' => c - b'a' + 26,
                b'0'..=b'9' => c - b'0' + 52,
                b'+' => 62,
                b'/' => 63,
                b'=' if last && j >= 2 => {
                    pad += 1;
                    0
                }
                _ => return Err(bad()),
            };
            if pad > 0 && c != b'=' {
                return Err(bad());
            }
            n = (n << 6) | u32::from(v);
        }
        let bytes = [(n >> 16) as u8, (n >> 8) as u8, n as u8];
        out.extend_from_slice(&bytes[..3 - pad]);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn escapes_like_the_powershell_helper() {
        assert_eq!(esc(Some("a\"b\\c\n\u{1}é空")), "\"a\\\"b\\\\c\\u000a\\u0001é空\"");
        assert_eq!(esc(None), "null");
    }

    #[test]
    fn casts_like_powershell() {
        assert_eq!(ps_int(&json!(null)).ok(), Some(0));
        assert_eq!(ps_int(&json!(34)).ok(), Some(34));
        assert_eq!(ps_int(&json!(2.5)).ok(), Some(2));
        assert_eq!(ps_int(&json!(3.5)).ok(), Some(4));
        assert_eq!(ps_int(&json!("12")).ok(), Some(12));
        assert!(ps_int(&json!("x")).is_err());
        assert!(ps_int(&json!(1e12)).is_err());
        assert_eq!(ps_long(&json!(5000000000i64)).ok(), Some(5000000000));
        assert_eq!(ps_long(&json!(9007199254740994i64)).ok(), Some(9007199254740994));
        assert_eq!(ps_int(&json!("0x100")).ok(), Some(256));
        assert_eq!(ps_int(&json!(" -12 ")).ok(), Some(-12));
        assert!(ps_int(&json!("0x")).is_err() && ps_int(&json!("12abc")).is_err());
        assert!(!ps_bool(&json!([false])) && ps_bool(&json!([true])) && ps_bool(&json!([false, false])) && !ps_bool(&json!([])));
        let req = json!({"ID": 3, "Cmd": "x", "args": {"Path": "p"}});
        assert_eq!(field(&req, "id"), &json!(3));
        assert_eq!(field(&req, "cmd"), &json!("x"));
        assert_eq!(field(field(&req, "args"), "path"), &json!("p"));
        assert_eq!(field(&json!(5), "path"), &Value::Null);
        assert!(ps_bool(&json!(true)) && !ps_bool(&json!(false)) && !ps_bool(&json!(0)) && ps_bool(&json!(1)));
        assert!(!ps_bool(&json!(null)) && !ps_bool(&json!("")) && ps_bool(&json!("false")));
        assert_eq!(ps_string(&json!(null)), "");
        assert_eq!(ps_string(&json!("7")), "7");
        assert_eq!(ps_string(&json!(7)), "7");
    }

    #[test]
    fn base64_round_trips() {
        for n in 0..10 {
            let data: Vec<u8> = (0..n).map(|i| (i * 37 + 11) as u8).collect();
            assert_eq!(unbase64(&base64(&data)).ok().unwrap(), data);
        }
        assert_eq!(base64(b"fLaC"), "ZkxhQw==");
        assert!(unbase64("abc").is_err());
        assert!(unbase64("ab=c").is_err());
        assert_eq!(unbase64("Zkxh\r\nQw==").ok().unwrap(), b"fLaC");
    }
}
