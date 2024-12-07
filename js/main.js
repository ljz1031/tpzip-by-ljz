document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const previewArea = document.getElementById('previewArea');
    const originalImage = document.getElementById('originalImage');
    const compressedImage = document.getElementById('compressedImage');
    const originalSize = document.getElementById('originalSize');
    const compressedSize = document.getElementById('compressedSize');
    const qualitySlider = document.getElementById('qualitySlider');
    const qualityValue = document.getElementById('qualityValue');
    const downloadBtn = document.getElementById('downloadBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const progressBar = document.getElementById('progressBar');
    const errorMessage = document.getElementById('errorMessage');
    const retryBtn = document.getElementById('retryBtn');

    let currentFile = null;
    let compressAttempts = 0;
    const MAX_RETRY_ATTEMPTS = 3;

    // 确保一开始是隐藏的
    loadingOverlay.hidden = true;

    // 修改显示加载状态函数
    function showLoading() {
        if (currentFile) {  // 只有在真正处理文件时才显示
            loadingOverlay.hidden = false;
            progressBar.style.width = '0%';
        }
    }

    // 隐藏加载状态
    function hideLoading() {
        loadingOverlay.hidden = true;
        progressBar.style.width = '0%';
    }

    // 更新进度条
    function updateProgress(percent) {
        progressBar.style.width = `${percent}%`;
    }

    // 显示错误消息
    function showError() {
        errorMessage.hidden = false;
    }

    // 隐藏错误消息
    function hideError() {
        errorMessage.hidden = true;
    }

    // 清理资源
    function cleanup() {
        if(originalImage.src) {
            URL.revokeObjectURL(originalImage.src);
        }
        if(compressedImage.src) {
            URL.revokeObjectURL(compressedImage.src);
        }
    }

    // 处理拖放上传
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.match('image.*')) {
            processFile(file);
        }
    });

    // 处理点击上传
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            processFile(file);
        }
    });

    // 添加防抖处理
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // 优化滑块处理
    qualitySlider.addEventListener('input', debounce((e) => {
        qualityValue.textContent = `${e.target.value}%`;
        if (currentFile) {
            showLoading();
            compressImage(currentFile, e.target.value / 100)
                .finally(() => {
                    hideLoading();
                });
        }
    }, 300));

    // 添加点击上传功能
    const uploadBox = document.getElementById('uploadBox');
    uploadBox.addEventListener('click', () => {
        fileInput.click();
    });

    // 防止点击 label 时触发两次
    const uploadLabel = document.querySelector('.upload-label');
    uploadLabel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // 处理文件
    async function processFile(file) {
        try {
            // 先隐藏加载状态，只在实际处理时才显示
            hideLoading();
            hideError();
            cleanup();
            
            if (!file) {
                throw new Error('没有选择文件');
            }
            
            if (!file.type.match('image.*')) {
                throw new Error('请选择图片文件');
            }
            
            if (file.size > 50 * 1024 * 1024) {
                throw new Error('文件大小不能超过 50MB');
            }
            
            currentFile = file;
            previewArea.hidden = false;
            compressAttempts = 0;
            
            // 读取原始图片时不需要显示加载状态
            originalSize.textContent = formatFileSize(file.size);
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    originalImage.src = e.target.result;
                    // 只在压缩图片时显示加载状态
                    showLoading();
                    updateProgress(40);
                    await compressImage(file, qualitySlider.value / 100);
                    hideLoading();
                } catch (error) {
                    if (compressAttempts < MAX_RETRY_ATTEMPTS) {
                        compressAttempts++;
                        await compressImage(file, qualitySlider.value / 100);
                    } else {
                        throw error;
                    }
                }
            };
            reader.onerror = () => {
                throw new Error('文件读取失败');
            };
            reader.readAsDataURL(file);
            
        } catch (error) {
            hideLoading();
            showError();
            alert(error.message);
            console.error(error);
        }
    }

    // 压缩图片
    function compressImage(file, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                
                img.onload = () => {
                    updateProgress(60);
                    
                    try {
                        const { width, height } = calculateSize(img.width, img.height);
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;

                        const ctx = canvas.getContext('2d');
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, width, height);

                        updateProgress(80);

                        canvas.toBlob((blob) => {
                            if (!blob) {
                                reject(new Error('压缩失败'));
                                return;
                            }

                            updateProgress(90);

                            // 如果压缩后反而变大，使用原图
                            if (blob.size >= file.size) {
                                compressedImage.src = URL.createObjectURL(file);
                                compressedSize.textContent = formatFileSize(file.size);
                            } else {
                                const url = URL.createObjectURL(blob);
                                compressedImage.src = url;
                                compressedSize.textContent = formatFileSize(blob.size);
                            }

                            updateProgress(100);

                            // 更新下载按钮
                            downloadBtn.onclick = () => {
                                const link = document.createElement('a');
                                link.href = compressedImage.src;
                                link.download = `compressed_${file.name}`;
                                link.click();
                            };

                            resolve();
                        }, file.type, quality);
                    } catch (error) {
                        reject(error);
                    }
                };

                img.onerror = () => reject(new Error('图片加载失败'));
                img.src = e.target.result;
            };

            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
        });
    }

    // 重试按钮事件
    retryBtn.addEventListener('click', () => {
        hideError();
        if (currentFile) {
            processFile(currentFile);
        }
    });

    // 防止内存泄漏
    window.addEventListener('beforeunload', cleanup);

    // 添加计算压缩尺寸的函数
    function calculateSize(width, height) {
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;
        
        // 如果图片尺寸已经很小，就不压缩尺寸
        if (width <= MAX_WIDTH && height <= MAX_HEIGHT) {
            return { width, height };
        }
        
        let ratio = width / height;
        
        if (width > MAX_WIDTH) {
            width = MAX_WIDTH;
            height = Math.round(width / ratio);
        }
        
        if (height > MAX_HEIGHT) {
            height = MAX_HEIGHT;
            width = Math.round(height * ratio);
        }
        
        return { width, height };
    }

    // 格式化文件大小
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}); 