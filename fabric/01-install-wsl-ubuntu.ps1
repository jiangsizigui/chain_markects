# =============================================================
# 脚本 1/4: 安装 WSL Ubuntu（仅需运行一次）
# 用途: 为 Hyperledger Fabric 准备 Linux 运行环境
# 运行方式: 以管理员权限运行 PowerShell
# =============================================================

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " Fabric 自建链 - WSL Ubuntu 安装脚本" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# 检查 WSL 中是否已有 Ubuntu
$wslList = wsl --list --quiet 2>&1
if ($wslList -match "Ubuntu") {
    Write-Host "[OK] WSL Ubuntu 已安装，跳过安装步骤。" -ForegroundColor Green
} else {
    Write-Host "[步骤 1] 安装 WSL Ubuntu-22.04..." -ForegroundColor Yellow
    Write-Host "  这将弹出 Ubuntu 安装窗口，按提示设置用户名和密码。" -ForegroundColor White
    Write-Host "  推荐用户名: fabric  密码: fabric123" -ForegroundColor White
    wsl --install -d Ubuntu-22.04
    Write-Host "[完成] Ubuntu 安装完成，请在 Ubuntu 终端中设置用户名/密码后，重新运行本脚本确认。" -ForegroundColor Green
    Write-Host "  设置完成后，运行下一个脚本: 02-setup-fabric-in-wsl.ps1" -ForegroundColor Cyan
    exit 0
}

Write-Host ""
Write-Host "[OK] WSL Ubuntu 已就绪，可以继续运行: 02-setup-fabric-in-wsl.ps1" -ForegroundColor Green
