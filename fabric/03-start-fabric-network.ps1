# =============================================================
# 脚本 4/4: 一键启动 Fabric 网络（主入口）
# 用途: 在 WSL Ubuntu 中运行 start-network.sh，启动 Docker 节点并部署链码
# 运行方式: PowerShell（已安装 WSL Ubuntu 后运行）
# =============================================================

$ErrorActionPreference = "Stop"

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host " Fabric 自建链 - 一键启动脚本" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan

# ---- 检查 WSL Ubuntu 是否存在 ----
$wslList = wsl --list --quiet 2>&1
$hasUbuntu = $wslList | Where-Object { $_ -match "Ubuntu" }
if (-not $hasUbuntu) {
    Write-Host ""
    Write-Host "[错误] 未检测到 WSL Ubuntu！" -ForegroundColor Red
    Write-Host ""
    Write-Host "请先以管理员权限运行:" -ForegroundColor Yellow
    Write-Host "  .\fabric\01-install-wsl-ubuntu.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "安装完成后重新运行本脚本。" -ForegroundColor Yellow
    exit 1
}

# ---- 检查 Docker Desktop 是否运行 ----
try {
    $null = docker version 2>&1
    Write-Host "[OK] Docker Desktop 运行中" -ForegroundColor Green
} catch {
    Write-Host "[错误] Docker Desktop 未运行，请启动后重试。" -ForegroundColor Red
    exit 1
}

# ---- 在 WSL 中执行启动脚本 ----
Write-Host ""
Write-Host "[步骤 1] 在 WSL Ubuntu 中启动 Fabric 网络..." -ForegroundColor Yellow
Write-Host "  （首次运行需下载 Fabric 镜像，约 5-15 分钟，请耐心等待）" -ForegroundColor White
Write-Host ""

# 将 Windows 脚本路径转换为 WSL 路径
$scriptPath = "/mnt/d/毕业/blockchain-prediction-market-platform/fabric/scripts/start-network.sh"

wsl -d Ubuntu-22.04 -- bash -c "chmod +x '$scriptPath' && bash '$scriptPath'"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[错误] 网络启动失败，请检查上方日志。" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  ✅ Fabric 网络启动成功！" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""
Write-Host "下一步: 更新 .env 文件并启动应用服务器" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. 编辑 .env，填入 Fabric 配置（路径见上方输出）" -ForegroundColor White
Write-Host "  2. 启动后端: node server.ts" -ForegroundColor White
Write-Host "  3. 访问: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "停止网络: .\fabric\down-fabric-network.ps1" -ForegroundColor Gray
