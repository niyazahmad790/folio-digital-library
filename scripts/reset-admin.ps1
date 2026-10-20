$ErrorActionPreference = 'Stop'

Write-Host "Admin password reset. Enter values in this terminal; passwords stay hidden." -ForegroundColor Yellow

$databaseUsername = Read-Host 'MySQL username [root]'
if ([string]::IsNullOrWhiteSpace($databaseUsername)) {
    $databaseUsername = 'root'
}

$secureDatabasePassword = Read-Host 'MySQL password' -AsSecureString
$databasePasswordPointer = [IntPtr]::Zero
$adminPasswordPointer = [IntPtr]::Zero

try {
    $databasePasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDatabasePassword)
    $adminEmail = (Read-Host 'Admin email to reset').Trim()
    if ($adminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        throw 'Enter a valid admin email address.'
    }

    $secureAdminPassword = Read-Host 'New admin password' -AsSecureString
    if ($secureAdminPassword.Length -lt 8) {
        throw 'Use a new admin password with at least 8 characters.'
    }
    $adminPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureAdminPassword)

    $keyBytes = New-Object byte[] 48
    $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $randomGenerator.GetBytes($keyBytes)
    } finally {
        $randomGenerator.Dispose()
    }

    $env:DB_USERNAME = $databaseUsername
    $env:DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($databasePasswordPointer)
    $env:JWT_SECRET = [Convert]::ToBase64String($keyBytes)
    $env:ADMIN_BOOTSTRAP_EMAIL = $adminEmail
    $env:ADMIN_BOOTSTRAP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPasswordPointer)
    $env:APP_ADMIN_BOOTSTRAP_ENABLED = 'true'
    $env:APP_ADMIN_BOOTSTRAP_RESET_EXISTING_PASSWORD = 'true'
    $env:SERVER_PORT = '8081'

    $projectRoot = Split-Path -Parent $PSScriptRoot
    Push-Location $projectRoot
    try {
        & .\mvnw.cmd spring-boot:run
    } finally {
        Pop-Location
    }
} finally {
    if ($databasePasswordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($databasePasswordPointer)
    }
    if ($adminPasswordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPasswordPointer)
    }
    Remove-Item Env:DB_PASSWORD,Env:JWT_SECRET,Env:ADMIN_BOOTSTRAP_PASSWORD,Env:ADMIN_BOOTSTRAP_EMAIL,Env:APP_ADMIN_BOOTSTRAP_ENABLED,Env:APP_ADMIN_BOOTSTRAP_RESET_EXISTING_PASSWORD,Env:SERVER_PORT -ErrorAction SilentlyContinue
}
