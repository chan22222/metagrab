const ytdlp = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');

class YouTubeDownloader {
    // Supabase에서 쿠키를 가져와서 Netscape 파일로 변환
    async prepareCookiesFile() {
        try {
            const supabase = require('../services/supabase');
            if (!supabase.enabled) return null;

            const cookieData = await supabase.getSession('youtube_cookie');
            if (!cookieData) return null;

            const cookiesPath = path.join(__dirname, '..', 'youtube_cookies.txt');
            const trimmed = cookieData.trim();

            let netscapeContent;

            // 이미 Netscape 형식인지 확인
            if (trimmed.startsWith('# Netscape') || trimmed.startsWith('# HTTP Cookie')) {
                netscapeContent = trimmed;
            } else {
                // JSON 배열 형식 시도
                try {
                    let cookieArray = JSON.parse(trimmed);
                    if (!Array.isArray(cookieArray)) cookieArray = [cookieArray];

                    const lines = ['# Netscape HTTP Cookie File', ''];
                    for (const c of cookieArray) {
                        const domain = c.domain || '.youtube.com';
                        const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
                        const p = c.path || '/';
                        const secure = c.secure ? 'TRUE' : 'FALSE';
                        const expiry = c.expirationDate ? Math.floor(c.expirationDate) : (c.expiry || 0);
                        if (c.name) {
                            lines.push(`${domain}\t${flag}\t${p}\t${secure}\t${expiry}\t${c.name}\t${c.value || ''}`);
                        }
                    }
                    netscapeContent = lines.join('\n');
                } catch {
                    // 탭 구분 Netscape 형식 (헤더 없음)
                    netscapeContent = '# Netscape HTTP Cookie File\n\n' + trimmed;
                }
            }

            fs.writeFileSync(cookiesPath, netscapeContent);
            return cookiesPath;
        } catch (e) {
            console.error('[YouTube] 쿠키 파일 준비 실패:', e.message);
            return null;
        }
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

            // Supabase에서 쿠키 파일 준비
            const cookiesPath = await this.prepareCookiesFile();

            const ytdlpOptions = {
                dumpSingleJson: true,
                noCheckCertificates: true,
                noWarnings: true,
                noCheckFormats: true,
                preferFreeFormats: true,
            };

            if (cookiesPath) {
                ytdlpOptions.cookies = cookiesPath;
                console.log('[YouTube] 쿠키 사용');
            }

            const info = await ytdlp(videoUrl, ytdlpOptions);

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
