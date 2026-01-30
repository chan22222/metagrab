const https = require('https');
const fs = require('fs');
const path = require('path');

const binDir = path.join(__dirname, '..', 'node_modules', 'yt-dlp-exec', 'bin');
const binPath = path.join(binDir, 'yt-dlp');
const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                return download(res.headers.location, dest).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Download failed: ${res.statusCode}`));
            }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        });
        request.on('error', reject);
        request.setTimeout(60000, () => {
            request.destroy();
            reject(new Error('Download timeout'));
        });
    });
}

async function main() {
    if (!fs.existsSync(binDir)) {
        console.log('[yt-dlp-update] bin 디렉토리 없음, 스킵');
        return;
    }

    try {
        console.log('[yt-dlp-update] 최신 yt-dlp 바이너리 다운로드 중...');
        await download(url, binPath);
        fs.chmodSync(binPath, 0o755);
        console.log('[yt-dlp-update] 업데이트 완료');
    } catch (err) {
        console.log('[yt-dlp-update] 업데이트 실패 (기존 바이너리 사용):', err.message);
    }
}

main();
