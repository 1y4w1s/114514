// 全局变量
let ffmpeg;
let videoData = null;
let selectedQuality = null;

// 初始化FFmpeg
async function initFFmpeg() {
    if (!ffmpeg) {
        ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => {
            console.log(message);
        });
        ffmpeg.on('progress', ({ progress }) => {
            updateMergeProgress(Math.round(progress * 100));
        });
        await ffmpeg.load();
    }
}

// 解析BV号或链接
function extractBVId(input) {
    // 匹配BV号格式
    const bvMatch = input.match(/BV[0-9A-Za-z]{10}/);
    if (bvMatch) {
        return bvMatch[0];
    }
    return null;
}

// 解析视频
async function parseVideo() {
    const input = document.getElementById('videoUrl').value.trim();
    if (!input) {
        showMessage('请输入视频链接或BV号', 'error');
        return;
    }

    const bvId = extractBVId(input);
    if (!bvId) {
        showMessage('无效的B站链接或BV号', 'error');
        return;
    }

    showMessage('正在解析视频信息...', 'info');
    
    try {
        // 使用代理服务器获取B站API数据（解决CORS问题）
        const proxyUrl = `https://cors-anywhere.herokuapp.com/https://api.bilibili.com/x/web-interface/view?bvid=${bvId}`;
        const response = await fetch(proxyUrl, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        const data = await response.json();
        
        if (data.code !== 0) {
            throw new Error(data.message || '获取视频信息失败');
        }

        videoData = data.data;
        displayVideoInfo();
        await loadVideoQualities();
        
        showMessage('视频解析成功！请选择画质', 'success');
    } catch (error) {
        console.error('解析视频失败:', error);
        showMessage('解析视频失败: ' + error.message, 'error');
    }
}

// 显示视频信息
function displayVideoInfo() {
    const info = videoData;
    
    document.getElementById('videoTitle').textContent = info.title;
    document.getElementById('videoDescription').textContent = info.desc.substring(0, 100) + '...';
    document.getElementById('videoDuration').textContent = `时长: ${formatDuration(info.duration)}`;
    document.getElementById('videoUploader').textContent = `UP主: ${info.owner.name}`;
    document.getElementById('videoViews').textContent = `播放量: ${formatNumber(info.stat.view)}`;
    document.getElementById('videoCover').src = info.pic;
    
    document.getElementById('videoInfo').classList.remove('hidden');
}

// 加载视频画质选项
async function loadVideoQualities() {
    const bvId = videoData.bvid;
    const cid = videoData.cid;
    
    try {
        const proxyUrl = `https://cors-anywhere.herokuapp.com/https://api.bilibili.com/x/player/playurl?bvid=${bvId}&cid=${cid}&qn=80&fnver=0&fnval=16&fourk=1`;
        const response = await fetch(proxyUrl, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        const data = await response.json();
        
        if (data.code !== 0) {
            throw new Error(data.message || '获取播放链接失败');
        }

        const qualitySelect = document.getElementById('qualitySelect');
        qualitySelect.innerHTML = '<option value="">请选择画质</option>';
        
        // 添加画质选项
        if (data.data.durl) {
            // 老版本API格式
            data.data.durl.forEach((item, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `画质 ${index + 1}`;
                qualitySelect.appendChild(option);
            });
        } else if (data.data.dash) {
            // DASH格式
            const qualities = [
                { id: 120, desc: '4K' },
                { id: 116, desc: '1080P60' },
                { id: 112, desc: '1080P+' },
                { id: 80, desc: '1080P' },
                { id: 74, desc: '720P60' },
                { id: 64, desc: '720P' },
                { id: 32, desc: '480P' },
                { id: 16, desc: '360P' }
            ];
            
            qualities.forEach(quality => {
                if (data.data.dash.video.find(v => v.id === quality.id)) {
                    const option = document.createElement('option');
                    option.value = quality.id;
                    option.textContent = quality.desc;
                    qualitySelect.appendChild(option);
                }
            });
        }
        
        document.getElementById('qualitySection').classList.remove('hidden');
        
        // 监听画质选择
        qualitySelect.onchange = function() {
            selectedQuality = this.value;
            if (selectedQuality) {
                document.getElementById('downloadSection').classList.remove('hidden');
            } else {
                document.getElementById('downloadSection').classList.add('hidden');
            }
        };
        
    } catch (error) {
        console.error('获取画质选项失败:', error);
        showMessage('获取画质选项失败: ' + error.message, 'error');
    }
}

// 下载视频
async function downloadVideo() {
    if (!selectedQuality) {
        showMessage('请先选择画质', 'error');
        return;
    }

    document.getElementById('progressSection').classList.remove('hidden');
    document.getElementById('downloadSection').classList.add('hidden');
    
    try {
        await initFFmpeg();
        
        const bvId = videoData.bvid;
        const cid = videoData.cid;
        
        // 获取视频播放链接
        const proxyUrl = `https://cors-anywhere.herokuapp.com/https://api.bilibili.com/x/player/playurl?bvid=${bvId}&cid=${cid}&qn=${selectedQuality}&fnver=0&fnval=16&fourk=1`;
        const response = await fetch(proxyUrl, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        const data = await response.json();
        
        if (data.code !== 0) {
            throw new Error(data.message || '获取下载链接失败');
        }

        let videoUrl, audioUrl;
        
        if (data.data.dash) {
            // DASH格式，需要分别下载视频和音频
            const videoStream = data.data.dash.video.find(v => v.id == selectedQuality);
            const audioStream = data.data.dash.audio[0]; // 选择第一个音频流
            
            if (!videoStream || !audioStream) {
                throw new Error('未找到可用的视频或音频流');
            }
            
            videoUrl = videoStream.baseUrl;
            audioUrl = audioStream.baseUrl;
            
            // 下载视频和音频文件
            updateStatus('正在下载视频流...');
            const videoBlob = await downloadMedia(videoUrl, 'video');
            updateDownloadProgress(50);
            
            updateStatus('正在下载音频流...');
            const audioBlob = await downloadMedia(audioUrl, 'audio');
            updateDownloadProgress(100);
            
            // 合并视频和音频
            updateStatus('正在合并视频和音频...');
            await mergeVideoAudio(videoBlob, audioBlob);
            
        } else if (data.data.durl) {
            // 老版本格式，视频和音频在一起
            videoUrl = data.data.durl[0].url;
            
            updateStatus('正在下载视频...');
            const videoBlob = await downloadMedia(videoUrl, 'video');
            updateDownloadProgress(100);
            
            // 直接提供下载
            downloadBlob(videoBlob, `${videoData.title}.mp4`);
            updateStatus('下载完成！');
        }
        
    } catch (error) {
        console.error('下载失败:', error);
        showMessage('下载失败: ' + error.message, 'error');
        updateStatus('下载失败');
    }
}

// 下载媒体文件
async function downloadMedia(url, type) {
    const response = await fetch(url, {
        headers: {
            'Referer': 'https://www.bilibili.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    
    if (!response.ok) {
        throw new Error(`下载失败: ${response.status}`);
    }
    
    return await response.blob();
}

// 合并视频和音频
async function mergeVideoAudio(videoBlob, audioBlob) {
    const videoFileName = 'video.mp4';
    const audioFileName = 'audio.mp4';
    const outputFileName = `${videoData.title.replace(/[^\w\s.-]/g, '')}.mp4`;
    
    // 写入文件到FFmpeg虚拟文件系统
    await ffmpeg.writeFile(videoFileName, await fetchFile(videoBlob));
    await ffmpeg.writeFile(audioFileName, await fetchFile(audioBlob));
    
    // 合并视频和音频
    await ffmpeg.exec([
        '-i', videoFileName,
        '-i', audioFileName,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-y',
        outputFileName
    ]);
    
    // 读取合并后的文件
    const outputData = await ffmpeg.readFile(outputFileName);
    const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' });
    
    // 提供下载
    downloadBlob(outputBlob, outputFileName);
    updateStatus('视频合并完成！');
}

// 下载Blob文件
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 更新下载进度
function updateDownloadProgress(percent) {
    document.getElementById('downloadPercent').textContent = percent + '%';
    document.getElementById('downloadProgress').style.width = percent + '%';
}

// 更新合并进度
function updateMergeProgress(percent) {
    document.getElementById('mergePercent').textContent = percent + '%';
    document.getElementById('mergeProgress').style.width = percent + '%';
}

// 更新状态文本
function updateStatus(text) {
    document.getElementById('statusText').textContent = text;
}

// 显示消息
function showMessage(message, type) {
    // 创建消息元素
    const messageDiv = document.createElement('div');
    messageDiv.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
        type === 'error' ? 'bg-red-500' : 
        type === 'success' ? 'bg-green-500' : 
        'bg-blue-500'
    } text-white`;
    messageDiv.textContent = message;
    
    document.body.appendChild(messageDiv);
    
    // 3秒后自动移除
    setTimeout(() => {
        document.body.removeChild(messageDiv);
    }, 3000);
}

// 格式化时长
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

// 格式化数字
function formatNumber(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
}

// 将Blob转换为FFmpeg可用的文件格式
async function fetchFile(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
}

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', function() {
    // 添加回车键支持
    document.getElementById('videoUrl').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            parseVideo();
        }
    });
});
