use reqwest::header::{HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE, WWW_AUTHENTICATE};
use reqwest::{Client, RequestBuilder, Response, StatusCode, Url};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;

const JSON: &str = "application/json";
const GRAPHQL_ACCEPT: &str = "application/graphql-response+json, application/json";
const LIBRARY_PROBE: &str =
    r#"{"query":"query YomikuraProtectedLibrary { categories(first: 1) { nodes { id } } }","operationName":"YomikuraProtectedLibrary"}"#;
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_REQUEST_BYTES: usize = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 32 * 1024 * 1024;
const MAX_SESSIONS: usize = 16;
const SIGN_IN_NEEDED: &str = "This library connection has ended. Sign in again in Connection settings.";
const NOT_AVAILABLE: &str = "Could not access the protected library connection.";

struct Session {
    base: Url,
    client: Client,
    authorization: HeaderValue,
}

#[derive(Default)]
pub(crate) struct RemoteLibraryAuth {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SignedIn {
    session_id: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LibraryResponse {
    status: u16,
    content_type: String,
    bytes: Vec<u8>,
}

// Alternate path separators and encoded delimiters can be normalized by the
// HTTPS server or proxy after the client checks the base path.
fn unambiguous_path(path: &str) -> bool {
    let path = path.to_ascii_lowercase();
    !path.contains("//")
        && !path.contains(';')
        && !["%2f", "%5c", "%25", "%3b", "%2e", "%3f", "%23", "%00"]
            .iter()
            .any(|delimiter| path.contains(*delimiter))
}

fn parse_https(input: &str) -> Result<Url, String> {
    let clean = input.trim();
    if clean.contains('\\') || clean.chars().any(char::is_control) {
        return Err("Enter a valid HTTPS Suwayomi address.".into());
    }
    let url = Url::parse(clean).map_err(|_| "Enter a valid HTTPS Suwayomi address.".to_string())?;
    if url.scheme() != "https"
        || url.host().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || !unambiguous_path(url.path())
    {
        return Err("Protected libraries require an HTTPS address without embedded credentials.".into());
    }
    Ok(url)
}

fn base_url(input: &str) -> Result<Url, String> {
    let url = parse_https(input)?;
    if url.query().is_some() {
        return Err("Enter a library address without a query string.".into());
    }
    Ok(url)
}

fn graphql_url(base: &Url) -> Result<Url, String> {
    Url::parse(&format!("{}/api/graphql", base.as_str().trim_end_matches('/')))
        .map_err(|_| "Enter a valid HTTPS Suwayomi address.".into())
}

fn check_destination(session_base: &Url, selected: &str, target: &str, post: bool) -> Result<Url, String> {
    let selected = base_url(selected)?;
    if session_base.as_str().trim_end_matches('/') != selected.as_str().trim_end_matches('/') {
        return Err(SIGN_IN_NEEDED.into());
    }
    let target = parse_https(target)?;
    let endpoint = format!("{}/api/", session_base.path().trim_end_matches('/'));
    if target.origin() != session_base.origin()
        || !target.path().starts_with(&endpoint)
        || post && target != graphql_url(session_base)?
    {
        return Err("This request is outside the signed-in library’s API.".into());
    }
    Ok(target)
}

fn graphql_request(client: &Client, url: Url, body: String) -> RequestBuilder {
    client
        .post(url)
        .header(ACCEPT, GRAPHQL_ACCEPT)
        .header(CONTENT_TYPE, JSON)
        .body(body)
}

fn connection_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "The protected library did not respond in time.".into()
    } else if error.is_connect() {
        "Could not connect securely to Suwayomi. Check the address and its HTTPS certificate.".into()
    } else {
        "The protected library request could not be completed.".into()
    }
}

fn basic_challenge(response: &Response) -> bool {
    response.status() == StatusCode::UNAUTHORIZED
        && response.headers().get_all(WWW_AUTHENTICATE).iter().any(|header| {
            header
                .to_str()
                .ok()
                .and_then(|value| value.split_ascii_whitespace().next())
                .is_some_and(|scheme| scheme.eq_ignore_ascii_case("basic"))
        })
}

async fn read_bytes(mut response: Response, limit: usize) -> Result<Vec<u8>, String> {
    const TOO_LARGE: &str = "The protected library response exceeded the size limit.";
    if response.content_length().is_some_and(|size| size > limit as u64) {
        return Err(TOO_LARGE.into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(connection_error)? {
        if chunk.len() > limit - bytes.len() {
            return Err(TOO_LARGE.into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

#[tauri::command]
pub(crate) async fn sign_in_suwayomi(
    state: State<'_, RemoteLibraryAuth>,
    server_base_url: String,
    username: String,
    password: String,
) -> Result<SignedIn, String> {
    let base = base_url(&server_base_url)?;
    if username.trim().is_empty()
        || password.is_empty()
        || username.len() > 4096
        || password.len() > 4096
        || username.contains(':')
        || username.chars().chain(password.chars()).any(char::is_control)
    {
        return Err("Enter a valid Suwayomi username and password.".into());
    }
    // Reqwest's rustls platform verifier uses the OS trust store. Keep the
    // TLS verifier active and decline redirects before any authenticated request.
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(CONNECTION_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(connection_error)?;
    let url = graphql_url(&base)?;
    let challenge = graphql_request(&client, url.clone(), LIBRARY_PROBE.into())
        .send()
        .await
        .map_err(connection_error)?;
    if !basic_challenge(&challenge) {
        return Err("This Suwayomi address did not request Basic Auth. Check the server’s sign-in mode and final HTTPS address.".into());
    }

    let request = graphql_request(&client, url, LIBRARY_PROBE.into())
        .basic_auth(username, Some(password))
        .build()
        .map_err(connection_error)?;
    let mut authorization = request
        .headers()
        .get(AUTHORIZATION)
        .cloned()
        .ok_or_else(|| "Could not prepare the protected library connection.".to_string())?;
    authorization.set_sensitive(true);
    let response = client.execute(request).await.map_err(connection_error)?;
    if matches!(response.status(), StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
        return Err("Suwayomi rejected the username or password.".into());
    }
    if !response.status().is_success() {
        return Err("Suwayomi did not accept the protected library request.".into());
    }
    let probe = read_bytes(response, 64 * 1024).await?;
    let result: serde_json::Value =
        serde_json::from_slice(&probe).map_err(|_| "The server did not return a Suwayomi library response.".to_string())?;
    if !result["data"]["categories"]["nodes"].is_array()
        || result["errors"].as_array().is_some_and(|errors| !errors.is_empty())
    {
        return Err("The server declined access to its library.".into());
    }

    // Only a verified login may install a session. A later frontend operation
    // must present the same opaque handle and server base for every request.
    let mut sessions = state.sessions.lock().map_err(|_| NOT_AVAILABLE)?;
    if sessions.len() >= MAX_SESSIONS {
        return Err("Close unused library connections before signing in again.".into());
    }
    let session_id = uuid::Uuid::new_v4().to_string();
    sessions.insert(session_id.clone(), Arc::new(Session { base, client, authorization }));
    Ok(SignedIn { session_id })
}

#[tauri::command]
pub(crate) fn clear_suwayomi_session(
    state: State<'_, RemoteLibraryAuth>,
    session_id: String,
) -> Result<(), String> {
    state.sessions.lock().map_err(|_| NOT_AVAILABLE)?.remove(&session_id);
    Ok(())
}

#[tauri::command]
pub(crate) async fn request_suwayomi(
    state: State<'_, RemoteLibraryAuth>,
    session_id: String,
    server_base_url: String,
    url: String,
    body: Option<String>,
) -> Result<LibraryResponse, String> {
    let session = state
        .sessions
        .lock()
        .map_err(|_| NOT_AVAILABLE)?
        .get(&session_id)
        .cloned()
        .ok_or_else(|| SIGN_IN_NEEDED.to_string())?;
    let target = check_destination(&session.base, &server_base_url, &url, body.is_some())?;
    let request = if let Some(body) = body {
        if body.len() > MAX_REQUEST_BYTES {
            return Err("The protected library request exceeded the size limit.".into());
        }
        graphql_request(&session.client, target, body)
    } else {
        session.client.get(target)
    };
    let response = request
        .header(AUTHORIZATION, session.authorization.clone())
        .send()
        .await
        .map_err(connection_error)?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_owned();
    let bytes = if status.is_success() {
        read_bytes(response, MAX_RESPONSE_BYTES).await?
    } else {
        Vec::new()
    };
    if !state.sessions.lock().map_err(|_| NOT_AVAILABLE)?.contains_key(&session_id) {
        return Err(SIGN_IN_NEEDED.into());
    }
    Ok(LibraryResponse { status: status.as_u16(), content_type, bytes })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restricts_credentials_to_the_exact_https_library_api() {
        let base = base_url("https://library.example/yomikura/").unwrap();
        let allowed = "https://library.example/yomikura/api/graphql";
        assert!(check_destination(&base, "https://library.example/yomikura", allowed, true).is_ok());
        assert!(check_destination(
            &base,
            base.as_str(),
            "https://library.example/yomikura/api/v1/manga/1/thumbnail?timestamp=7",
            false
        ).is_ok());
        for blocked in [
            "http://library.example/yomikura/api/graphql",
            "https://other.example/yomikura/api/graphql",
            "https://library.example:9443/yomikura/api/graphql",
            "https://user@library.example/yomikura/api/graphql",
            "https://library.example/api/graphql",
            "https://library.example/yomikura-copy/api/graphql",
            "https://library.example/yomikura/api/../../login.html",
            "https://library.example/yomikura/api/%252e%252e%252fother",
            "https://library.example/yomikura/api/x%2Fy",
            "https://library.example/yomikura/api/x;test",
            "https://library.example/yomikura/api/graphql#test",
            "https://library.example/yomikura/apis/graphql",
        ] {
            assert!(check_destination(&base, base.as_str(), blocked, false).is_err(), "{blocked}");
        }
        assert!(check_destination(&base, "https://library.example/other", allowed, true).is_err());
        assert!(check_destination(&base, base.as_str(), "https://library.example/yomikura/api/images", true).is_err());
    }

    #[test]
    fn rejects_invalid_library_base_addresses() {
        for blocked in [
            "http://library.example",
            "https://user:secret@library.example",
            "https://library.example/api?query",
            "https://library.example/#fragment",
        ] {
            assert!(base_url(blocked).is_err(), "{blocked}");
        }
    }
}
