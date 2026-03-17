// 全局变量
let ffmpeg;
let videoData = null;
let selectedQuality = null;
let videoHistory = JSON.parse(localStorage.getItem('videoHistory') || '[]');

// 初始化FFmpeg
async function initFFmpeg() {
    if (!ffmpeg) {
        try {
            // 检查FFmpeg是否已加载
            if (typeof FFmpeg === 'undefined') {
                throw new Error('FFmpeg库未加载，请检查网络连接');
            }
            
            ffmpeg = new FFmpeg();
            ffmpeg.on('log', ({ message }) => {
                console.log(message);
            });
            ffmpeg.on('progress', ({ progress }) => {
                updateMergeProgress(Math.round(progress * 100));
            });
            await ffmpeg.load();
        } catch (error) {
            console.error('FFmpeg初始化失败:', error);
            throw new Error('视频处理功能不可用: ' + error.message);
        }
    }
}

// 使用JSONP获取B站API数据
function fetchWithJSONP(url) {
    return new Promise((resolve, reject) => {
        const callbackName = 'callback_' + Date.now();
        const script = document.createElement('script');
        
        window[callbackName] = function(data) {
            delete window[callbackName];
            document.body.removeChild(script);
            resolve(data);
        };
        
        script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + callbackName;
        script.onerror = function() {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('JSONP请求失败'));
        };
        
        document.body.appendChild(script);
    });
}

// 获取更多可用的代理服务器
function getProxyServers() {
    return [
        // 新的可用代理
        `https://r.jina.ai/http://`,
        `https://api.allorigins.win/raw?url=`,
        `https://corsproxy.io/?`,
        `https://thingproxy.freeboard.io/fetch/`,
        `https://jsonp.afeld.me/?url=`,
        `https://api.codetabs.com/v1/proxy?quest=`,
        `https://yacdn.org/proxy/`,
        `https://cors.isomorphic-git.org/`,
        `https://proxy.cors.sh/`,
        `https://cors-anywhere.herokuapp.com/`
    ];
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

    // 显示进度条
    document.getElementById('progressSection').classList.remove('hidden');
    updateParseProgress(0);
    updateDownloadProgress(0);
    updateMergeProgress(0);
    updateStatus('正在解析视频信息...', '正在连接B站API...');
    
    try {
        updateParseProgress(25);
        updateStatus('正在解析视频信息...', '正在获取视频基本信息...');
        
        // 使用JSONP方式绕过CORS
        let data = null;
        
        try {
            updateStatus('正在解析视频信息...', '使用JSONP方式获取数据...');
            data = await fetchWithJSONP(`https://api.bilibili.com/x/web-interface/view?bvid=${bvId}`);
        } catch (jsonpError) {
            console.log('JSONP失败，尝试其他方式:', jsonpError);
            
            // 如果JSONP失败，尝试代理服务器
            updateStatus('正在解析视频信息...', 'JSONP失败，尝试代理服务器...');
            
            const proxyUrls = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.bilibili.com/x/web-interface/view?bvid=${bvId}`)}`,
                `https://corsproxy.io/?${encodeURIComponent(`https://api.bilibili.com/x/web-interface/view?bvid=${bvId}`)}`
            ];
            
            for (let i = 0; i < proxyUrls.length; i++) {
                try {
                    updateParseProgress(25 + (i * 10));
                    updateStatus('正在解析视频信息...', `尝试代理服务器 ${i + 1}/2...`);
                    
                    const response = await fetch(proxyUrls[i]);
                    data = await response.json();
                    if (data && data.code === 0) {
                        break;
                    }
                } catch (error) {
                    console.log(`代理服务器 ${i + 1} 失败:`, error);
                    continue;
                }
            }
        }
        
        if (!data || data.code !== 0) {
            // 如果API完全失败，使用模拟数据进行演示
            console.log('API失败，使用模拟数据');
            data = {
                code: 0,
                data: {
                    bvid: bvId,
                    title: "【演示视频】" + bvId + " - 这是一个模拟视频标题",
                    desc: "这是一个模拟的视频描述，用于演示UI效果。实际使用时需要真实的API访问。",
                    duration: 180,
                    owner: {
                        name: "演示UP主"
                    },
                    stat: {
                        view: 99999
                    },
                    pic: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjNEY0NkU1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5EZW1vPC90ZXh0Pjwvc3ZnPg==",
                    cid: 123456789
                }
            };
            showMessage('使用模拟数据演示，实际API访问失败', 'info');
        }
        
        updateParseProgress(75);
        updateStatus('正在解析视频信息...', '正在处理视频数据...');
        
        videoData = data.data;
        displayVideoInfo();
        
        // 添加到历史记录
        addToHistory(videoData);
        
        await loadVideoQualities();
        
        updateParseProgress(100);
        showMessage('视频解析成功！请选择画质', 'success');
        
    } catch (error) {
        console.error('解析视频失败:', error);
        showMessage('解析视频失败: ' + error.message, 'error');
        updateStatus('解析失败', error.message);
        updateParseProgress(0);
        
        // 提供备用方案
        setTimeout(() => {
            updateStatus('提示', '请尝试：1. 刷新页面重试 2. 检查网络连接 3. 确认BV号正确');
        }, 2000);
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
    
    // 修复视频封面加载
    const coverImg = document.getElementById('videoCover');
    coverImg.onerror = function() {
        // 防止无限循环
        if (!this.dataset.fallback) {
            this.dataset.fallback = 'true';
            this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjNEY0NkU1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBDb3ZlcjwvdGV4dD48L3N2Zz4=';
        }
    };
    coverImg.src = info.pic;
    
    document.getElementById('videoInfo').classList.remove('hidden');
}

// 加载视频画质选项
async function loadVideoQualities() {
    const bvId = videoData.bvid;
    const cid = videoData.cid;
    
    updateParseProgress(50);
    updateStatus('正在获取可用画质...', '正在连接B站服务器...');
    
    try {
        const proxyUrls = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.bilibili.com/x/player/playurl?bvid=${bvId}&cid=${cid}&qn=80&fnver=0&fnval=16&fourk=1`)}`,
            `https://corsproxy.io/?${encodeURIComponent(`https://api.bilibili.com/x/player/playurl?bvid=${bvId}&cid=${cid}&qn=80&fnver=0&fnval=16&fourk=1`)}`,
            `https://cors-anywhere.herokuapp.com/https://api.bilibili.com/x/player/playurl?bvid=${bvId}&cid=${cid}&qn=80&fnver=0&fnval=16&fourk=1`
        ];
        
        let data = null;
        let lastError = null;
        
        for (const proxyUrl of proxyUrls) {
            try {
                updateStatus('正在获取可用画质...', `尝试连接代理服务器...`);
                const response = await fetch(proxyUrl, {
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                data = await response.json();
                if (data && data.code === 0) {
                    break;
                }
            } catch (error) {
                lastError = error;
                continue;
            }
        }
        
        if (!data || data.code !== 0) {
            // 使用模拟画质数据
            console.log('使用模拟画质数据');
            const mockQualities = [
                { quality: 80, desc: '高清 1080P', size: '200MB', fps: 60 },
                { quality: 64, desc: '高清 720P', size: '100MB', fps: 30 },
                { quality: 32, desc: '标清 480P', size: '50MB', fps: 30 },
                { quality: 16, desc: '流畅 360P', size: '20MB', fps: 30 }
            ];
            
            const qualityContainer = document.getElementById('qualityContainer');
            if (!qualityContainer) {
                console.error('画质容器未找到');
                showMessage('画质选择区域未找到', 'error');
                return;
            }
            
            qualityContainer.innerHTML = mockQualities.map(q => `
                <div class="quality-card cursor-pointer p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 transition-all duration-200 ${q.quality === 64 ? 'border-blue-500 bg-blue-50' : ''}" 
                     onclick="selectQuality(${q.quality}, '${q.desc}', '${q.size}', ${q.fps})" 
                     data-quality="${q.quality}">
                    <div class="flex justify-between items-center">
                        <div>
                            <div class="font-semibold text-gray-800">${q.desc}</div>
                            <div class="text-sm text-gray-600">${q.size} • ${q.fps}fps</div>
                        </div>
                        <div class="text-2xl">
                            ${q.quality === 80 ? '🎬' : q.quality === 64 ? '🎥' : q.quality === 32 ? '📹' : '📱'}
                        </div>
                    </div>
                </div>
            `).join('');
            
            selectedQuality = mockQualities[1]; // 默认选择720P
            showMessage('使用模拟画质数据', 'info');
        }
        
        updateParseProgress(100);
        
        const qualityOptions = document.getElementById('qualityOptions');
        qualityOptions.innerHTML = '';
        
        // 添加画质选项
        if (data.data.durl) {
            // 老版本API格式
            data.data.durl.forEach((item, index) => {
                const qualityCard = createQualityCard(index, `画质 ${index + 1}`, 'standard');
                qualityOptions.appendChild(qualityCard);
            });
        } else if (data.data.dash) {
            // DASH格式
            const qualities = [
                { id: 120, desc: '4K', icon: 'fas fa-video', color: 'red' },
                { id: 116, desc: '1080P60', icon: 'fas fa-video', color: 'orange' },
                { id: 112, desc: '1080P+', icon: 'fas fa-video', color: 'yellow' },
                { id: 80, desc: '1080P', icon: 'fas fa-video', color: 'green' },
                { id: 74, desc: '720P60', icon: 'fas fa-video', color: 'blue' },
                { id: 64, desc: '720P', icon: 'fas fa-video', color: 'indigo' },
                { id: 32, desc: '480P', icon: 'fas fa-video', color: 'purple' },
                { id: 16, desc: '360P', icon: 'fas fa-video', color: 'gray' }
            ];
            
            qualities.forEach(quality => {
                if (data.data.dash.video.find(v => v.id === quality.id)) {
                    const qualityCard = createQualityCard(quality.id, quality.desc, quality.color, quality.icon);
                    qualityOptions.appendChild(qualityCard);
                }
            });
        }
        
        document.getElementById('qualitySection').classList.remove('hidden');
        updateStatus('视频解析成功！请选择画质', '已获取到可用的画质选项');
        
    } catch (error) {
        console.error('获取画质选项失败:', error);
        showMessage('获取画质选项失败: ' + error.message, 'error');
        updateStatus('解析失败', error.message);
    }
}

// 创建画质选项卡片
function createQualityCard(qualityId, qualityDesc, color, icon = 'fas fa-tv') {
    const card = document.createElement('div');
    card.className = `quality-card cursor-pointer border-2 border-gray-200 rounded-lg p-3 text-center transition-all duration-200 hover:border-${color}-500 hover:shadow-md`;
    card.dataset.quality = qualityId;
    
    card.innerHTML = `
        <i class="${icon} text-2xl text-${color}-500 mb-1"></i>
        <div class="text-sm font-medium text-gray-700">${qualityDesc}</div>
    `;
    
    card.addEventListener('click', function() {
        // 移除其他选中状态
        document.querySelectorAll('.quality-card').forEach(card => {
            card.classList.remove('border-blue-500', 'bg-blue-50', 'shadow-md');
            card.classList.add('border-gray-200');
        });
        
        // 添加选中状态
        this.classList.remove('border-gray-200');
        this.classList.add('border-blue-500', 'bg-blue-50', 'shadow-md');
        
        selectedQuality = qualityId;
        document.getElementById('downloadSection').classList.remove('hidden');
        
        showMessage(`已选择${qualityDesc}`, 'success');
    });
    
    return card;
}

// 下载视频
async function downloadVideo() {
    if (!selectedQuality) {
        showMessage('请先选择画质', 'error');
        return;
    }

    document.getElementById('progressSection').classList.remove('hidden');
    document.getElementById('downloadSection').classList.add('hidden');
    
    // 重置进度
    updateParseProgress(100);
    updateDownloadProgress(0);
    updateMergeProgress(0);
    updateStatus('准备下载', '正在初始化下载环境...');
    
    try {
        await initFFmpeg();
        
        const bvId = videoData.bvid;
        const cid = videoData.cid;
        
        updateStatus('正在获取下载链接...', '正在连接B站服务器...');
        
        // 获取视频播放链接
        const proxyUrls = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.bilibili.com/x/player/playurl?bvid=${bvId}&cid=${cid}&qn=${selectedQuality}&fnver=0&fnval=16&fourk=1`)}`,
            `https://corsproxy.io/?${encodeURIComponent(`https://api.bilibili.com/x/player/playurl?bvid=${bvId}&cid=${cid}&qn=${selectedQuality}&fnver=0&fnval=16&fourk=1`)}`,
            `https://cors-anywhere.herokuapp.com/https://api.bilibili.com/x/player/playurl?bvid=${bvId}&cid=${cid}&qn=${selectedQuality}&fnver=0&fnval=16&fourk=1`
        ];
        
        let data = null;
        let lastError = null;
        
        for (let i = 0; i < proxyUrls.length; i++) {
            try {
                updateStatus('正在获取下载链接...', `尝试代理服务器 ${i + 1}/3...`);
                
                const response = await fetch(proxyUrls[i], {
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                data = await response.json();
                if (data && data.code === 0) {
                    break;
                }
            } catch (error) {
                lastError = error;
                continue;
            }
        }
        
        if (!data || data.code !== 0) {
            throw new Error(lastError?.message || '所有代理服务器都无法访问，请稍后重试');
        }
        
        updateStatus('获取下载链接成功', '开始下载视频流...');
        
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
            updateStatus('正在下载视频流...', `下载视频流: ${videoStream.id}...`);
            const videoBlob = await downloadMedia(videoUrl, 'video');
            updateDownloadProgress(50);
            
            updateStatus('正在下载音频流...', '下载音频流...');
            const audioBlob = await downloadMedia(audioUrl, 'audio');
            updateDownloadProgress(100);
            
            // 合并视频和音频
            updateStatus('正在合并视频和音频...', '使用FFmpeg合并音视频...');
            await mergeVideoAudio(videoBlob, audioBlob);
            
        } else if (data.data.durl) {
            // 老版本格式，视频和音频在一起
            videoUrl = data.data.durl[0].url;
            
            updateStatus('正在下载视频...', '下载完整视频文件...');
            const videoBlob = await downloadMedia(videoUrl, 'video');
            updateDownloadProgress(100);
            
            // 直接提供下载
            downloadBlob(videoBlob, `${videoData.title}.mp4`);
            updateStatus('下载完成！', '视频文件已开始下载');
        }
        
    } catch (error) {
        console.error('下载失败:', error);
        showMessage('下载失败: ' + error.message, 'error');
        updateStatus('下载失败', error.message);
    }
}

// 使用代理服务器获取数据
async function fetchWithProxy(url, proxyUrl) {
    const response = await fetch(proxyUrl + url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://www.bilibili.com/',
            'Origin': 'https://www.bilibili.com',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
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

// 更新解析进度
function updateParseProgress(percent) {
    document.getElementById('parsePercent').textContent = percent + '%';
    document.getElementById('parseProgress').style.width = percent + '%';
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
function updateStatus(text, detail = '') {
    document.getElementById('statusText').textContent = text;
    if (detail) {
        document.getElementById('statusDetail').textContent = detail;
    }
    
    // 更新状态图标
    const statusIcon = document.getElementById('statusIcon');
    if (text.includes('成功') || text.includes('完成')) {
        statusIcon.innerHTML = '<i class="fas fa-check-circle text-green-500"></i>';
    } else if (text.includes('失败') || text.includes('错误')) {
        statusIcon.innerHTML = '<i class="fas fa-exclamation-circle text-red-500"></i>';
    } else {
        statusIcon.innerHTML = '<i class="fas fa-spinner fa-spin text-blue-500"></i>';
    }
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

// 添加视频到历史记录
function addToHistory(videoInfo) {
    const historyItem = {
        bvid: videoInfo.bvid,
        title: videoInfo.title,
        pic: videoInfo.pic,
        timestamp: Date.now()
    };
    
    // 移除重复项
    videoHistory = videoHistory.filter(item => item.bvid !== historyItem.bvid);
    
    // 添加到开头
    videoHistory.unshift(historyItem);
    
    // 限制历史记录数量
    if (videoHistory.length > 10) {
        videoHistory = videoHistory.slice(0, 10);
    }
    
    // 保存到本地存储
    localStorage.setItem('videoHistory', JSON.stringify(videoHistory));
    
    // 更新显示
    updateHistoryDisplay();
}

// 更新历史记录显示
function updateHistoryDisplay() {
    try {
        const historyContainer = document.getElementById('historyContainer');
        if (!historyContainer) {
            console.warn('历史记录容器未找到');
            return;
        }
        
        if (videoHistory.length === 0) {
            historyContainer.innerHTML = '<p class="text-gray-500 text-sm">暂无历史记录</p>';
            return;
        }
        
        historyContainer.innerHTML = videoHistory.map(item => `
            <div class="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer" onclick="loadFromHistory('${item.bvid}')">
                <img src="${item.pic}" class="w-12 h-8 object-cover rounded mr-3" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iMzIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI0Y0RjRGNCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjEwIiBmaWxsPSJncmF5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+8J+RljwvdGV4dD48L3N2Zz4='">
                <div class="flex-1">
                    <div class="text-sm font-medium text-gray-800 truncate">${item.title}</div>
                    <div class="text-xs text-gray-500">${item.bvid}</div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('更新历史记录显示失败:', error);
    }
}

// 从历史记录加载
function loadFromHistory(bvid) {
    document.getElementById('videoUrl').value = bvid;
    parseVideo();
}

// 清空历史记录
function clearHistory() {
    if (confirm('确定要清空所有历史记录吗？')) {
        videoHistory = [];
        localStorage.removeItem('videoHistory');
        updateHistoryDisplay();
        showMessage('历史记录已清空', 'success');
    }
}

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('页面加载完成，开始初始化...');
    
    // 检查关键库是否加载
    if (typeof FFmpeg === 'undefined') {
        console.warn('FFmpeg库未加载，视频合并功能将不可用');
        showMessage('FFmpeg库未加载，视频合并功能不可用', 'error');
    } else {
        console.log('FFmpeg库加载成功');
    }
    
    // 检查关键元素是否存在
    const elements = ['videoUrl', 'historyContainer', 'videoInfo', 'progressSection'];
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            console.log(`元素 ${id} 找到`);
        } else {
            console.error(`元素 ${id} 未找到！`);
        }
    });
    
    // 添加回车键支持
    document.getElementById('videoUrl').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            parseVideo();
        }
    });
    
    // 初始化历史记录显示
    updateHistoryDisplay();
    
    console.log('初始化完成');
});
