const ytdlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const supabase = require('../services/supabase');

class YouTubeDownloader {
    convertJsonToNetscape(jsonStr) {
        try {
            const cookies = JSON.parse(jsonStr);
            if (!Array.isArray(cookies)) return null;

            const lines = ['# Netscape HTTP Cookie File'];
            for (const c of cookies) {
                const domain = c.domain || '.youtube.com';
                const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
                const path = c.path || '/';
                const secure = c.secure ? 'TRUE' : 'FALSE';
                const expiry = c.expirationDate ? Math.floor(c.expirationDate) : '0';
                const name = c.name;
                const value = c.value;
                if (name && value) {
                    lines.push(`${domain}\t${flag}\t${path}\t${secure}\t${expiry}\t${name}\t${value}`);
                }
            }
            return lines.join('\n');
        } catch {
            return null;
        }
    }

    async getCookiesPath() {
        const cookiesPath = path.join(__dirname, '..', 'youtube_cookies.txt');

        if (fs.existsSync(cookiesPath)) {
            const content = fs.readFileSync(cookiesPath, 'utf8').trim();
            if (content.startsWith('[')) {
                const netscape = this.convertJsonToNetscape(content);
                if (netscape) {
                    fs.writeFileSync(cookiesPath, netscape, 'utf8');
                }
            }
            return cookiesPath;
        }

        if (supabase.enabled) {
            const cookie = await supabase.getSession('youtube_cookie');
            if (cookie) {
                const netscape = this.convertJsonToNetscape(cookie);
                fs.writeFileSync(cookiesPath, netscape || cookie, 'utf8');
                return cookiesPath;
            }
        }

        return null;
    }

    extractVideoId(url) {
        const patterns = [
            /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
            /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
            /youtu\.be\/([A-Za-z0-9_-]{11})/,
            /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }

    async extractVideoUrl(url) {
        console.log(`[YouTube] URL 처리 시작: ${url}`);

        const videoId = this.extractVideoId(url);
        if (!videoId) {
            console.log('[YouTube] 비디오 ID 추출 실패');
            return null;
        }
        console.log(`[YouTube] Video ID: ${videoId}`);

        try {
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

            // yt-dlp 버전 확인
            try {
                const ver = await ytdlp('--version');
                console.log('[YouTube] yt-dlp 버전:', ver.toString().trim());
            } catch {}

            // yt-dlp로 정보 가져오기
            const baseOptions = {
                dumpSingleJson: true,
                noCheckCertificates: true,
                noWarnings: true,
                skipDownload: true,
            };

            const cookiesPath = await this.getCookiesPath();
            let info;

            if (cookiesPath) {
                try {
                    console.log('[YouTube] 쿠키로 시도...');
                    info = await ytdlp(videoUrl, { ...baseOptions, cookies: cookiesPath });
                } catch (cookieErr) {
                    console.log('[YouTube] 쿠키 실패, 쿠키 없이 재시도:', cookieErr.message?.split('\n')[0]);
                    info = await ytdlp(videoUrl, baseOptions);
                }
            } else {
                info = await ytdlp(videoUrl, baseOptions);
            }

            console.log(`[YouTube] 제목: ${info.title}`);

            // mp4 포맷 중 비디오+오디오 있는 것 선택 (HLS/m3u8 제외)
            let selectedFormat = null;

            // format_id가 있는 formats에서 선택
            if (info.formats && info.formats.length > 0) {
                // HLS(m3u8) 제외 필터
                const isDirectUrl = (f) => f.url && !f.url.includes('.m3u8') && !f.url.includes('manifest');

                // mp4 + 비디오 + 오디오 있는 포맷 우선 (HLS 제외)
                const mp4Formats = info.formats.filter(f =>
                    f.ext === 'mp4' &&
                    f.vcodec !== 'none' &&
                    f.acodec !== 'none' &&
                    isDirectUrl(f)
                ).sort((a, b) => (b.height || 0) - (a.height || 0));

                if (mp4Formats.length > 0) {
                    selectedFormat = mp4Formats[0];
                }

                // 없으면 그냥 url 있는 mp4 (HLS 제외)
                if (!selectedFormat) {
                    const anyMp4 = info.formats.filter(f =>
                        f.ext === 'mp4' && isDirectUrl(f)
                    ).sort((a, b) => (b.height || 0) - (a.height || 0));

                    if (anyMp4.length > 0) {
                        selectedFormat = anyMp4[0];
                    }
                }

                // 그래도 없으면 HLS 아닌 아무 url이나
                if (!selectedFormat) {
                    selectedFormat = info.formats.find(f => isDirectUrl(f));
                }

                // 정말 없으면 HLS라도 사용 (전사는 가능)
                if (!selectedFormat) {
                    console.log('[YouTube] 직접 MP4 없음, HLS 사용');
                    selectedFormat = info.formats.find(f => f.url);
                }
            }

            // 직접 URL 사용
            const directUrl = selectedFormat?.url || info.url;

            if (!directUrl) {
                console.log('[YouTube] 다운로드 URL을 찾을 수 없음');
                return null;
            }

            const quality = selectedFormat?.format_note || selectedFormat?.resolution || 'unknown';
            console.log(`[YouTube] 선택된 품질: ${quality}`);

            return {
                video_url: directUrl,
                thumbnail_url: info.thumbnail,
                title: info.title,
                platform: 'youtube',
                quality: quality,
                videoId: videoId
            };

        } catch (error) {
            console.error('[YouTube] 에러:', error.message);
            return null;
        }
    }

    static isValidUrl(url) {
        return /youtube\.com\/(watch|shorts)|youtu\.be\//.test(url);
    }
}

module.exports = YouTubeDownloader;
