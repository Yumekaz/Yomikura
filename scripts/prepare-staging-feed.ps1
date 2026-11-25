$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or !$env:RUNNER_TEMP) {
  throw 'The staging update feed is for a disposable GitHub Windows runner.'
}
$directory = Join-Path $env:RUNNER_TEMP 'yomikura-test-feed'
New-Item -Path $directory -ItemType Directory | Out-Null
$openssl = (Get-Command openssl.exe -ErrorAction SilentlyContinue).Source
if (!$openssl) { $openssl = Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe' }
$rootKey = Join-Path $directory 'root.key'
$rootCert = Join-Path $directory 'root.crt'
$serverKey = Join-Path $directory 'server.key'
$serverCert = Join-Path $directory 'server.crt'
$request = Join-Path $directory 'server.csr'
$extensions = Join-Path $directory 'server.ext'
Set-Content -LiteralPath $extensions -Value @('subjectAltName=IP:127.0.0.1', 'basicConstraints=critical,CA:FALSE', 'keyUsage=critical,digitalSignature,keyEncipherment', 'extendedKeyUsage=serverAuth')
& $openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=Yomikura CI fixture root' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign' -keyout $rootKey -out $rootCert 2>$null
if ($LASTEXITCODE) { throw 'Could not create the test certificate authority.' }
& $openssl req -new -newkey rsa:2048 -nodes -subj '/CN=localhost' -keyout $serverKey -out $request 2>$null
if ($LASTEXITCODE) { throw 'Could not create the loopback certificate request.' }
& $openssl x509 -req -in $request -CA $rootCert -CAkey $rootKey -CAcreateserial -days 1 -extfile $extensions -out $serverCert 2>$null
if ($LASTEXITCODE) { throw 'Could not sign the loopback certificate.' }
Import-Certificate -FilePath $rootCert -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
Set-Content -LiteralPath (Join-Path $directory 'tauri.conf.json') -Value (@{
  version = '1.0.24'
  plugins = @{ updater = @{ endpoints = @('https://127.0.0.1:9238/latest.json') } }
  bundle = @{ createUpdaterArtifacts = $false }
} | ConvertTo-Json -Depth 6)
