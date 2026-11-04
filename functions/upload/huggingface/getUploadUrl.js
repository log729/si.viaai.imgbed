import { getDatabase } from '../../utils/databaseAdapter.js';
/**
 * HuggingFace 大文件直传 API
 *
 * 流程：
 * 1. 前端计算 SHA256 和文件样本
 * 2. 前端调用此 API 获取 LFS 上传 URL
 * 3. 前端直接上传到 HuggingFace S3
 * 4. 前端调用 commitUpload API 提交文件引用
 *
 * 这样可以绕过 CF Workers 的 100MB 请求体限制和 CPU 时间限制
 */

import { HuggingFaceAPI } from '../../utils/storage/huggingfaceAPI.js';
import { fetchUploadConfig } from '../../utils/sysConfig.js';
import { guardUpload } from '../../utils/auth/passportUpload.js';
import { buildUniqueFileId, getUploadIp, isBlockedUploadIp, createResponse } from '../uploadTools.js';

export async function onRequestPost(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    context.url = url;  // 将 url 添加到 context 以便 buildUniqueFileId 使用

    try {
        // 鉴权
        const requiredPermission = 'upload';
        // 通行证登录的上传者：Origin 校验 / 白名单 / 限流（getUploadUrl 算一次上传，其余不算）
        const guard = await guardUpload({ env, url, request, requiredPermission, count: true });
        if (guard.response) {
            return guard.response;
        }

        context.uploader = guard.uploader;

        // 检查上传IP是否被封禁
        const uploadIp = getUploadIp(request);
        if (await isBlockedUploadIp(env, uploadIp)) {
            return createResponse(JSON.stringify({ error: 'IP blocked' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const body = await request.json();
        const { fileSize, fileName, fileType, sha256, fileSample, channelName, uploadNameType, uploadFolder } = body;
        const normalizedFileType = fileType || 'application/octet-stream';

        if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || typeof fileName !== 'string' || !fileName || fileName.length > 255 || !/^[a-fA-F0-9]{64}$/.test(sha256 || '') || typeof fileSample !== 'string' || !fileSample || fileSample.length > 2048) {
            return createResponse(JSON.stringify({
                error: 'Missing required fields: fileSize, fileName, sha256, fileSample'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 获取 HuggingFace 配置
        const uploadConfig = await fetchUploadConfig(env);
        const hfSettings = uploadConfig.huggingface;

        if (!hfSettings || !hfSettings.channels || hfSettings.channels.length === 0) {
            return createResponse(JSON.stringify({ error: 'No HuggingFace channel configured' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 选择渠道
        let hfChannel;
        if (channelName) {
            hfChannel = hfSettings.channels.find(c => c.name === channelName);
        }
        if (!hfChannel) {
            hfChannel = hfSettings.loadBalance?.enabled
                ? hfSettings.channels[Math.floor(Math.random() * hfSettings.channels.length)]
                : hfSettings.channels[0];
        }

        if (!hfChannel || !hfChannel.token || !hfChannel.repo) {
            return createResponse(JSON.stringify({ error: 'HuggingFace channel not properly configured' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 将命名参数添加到 URL 以便 buildUniqueFileId 使用
        if (uploadNameType) {
            url.searchParams.set('uploadNameType', uploadNameType);
        }
        if (uploadFolder) {
            url.searchParams.set('uploadFolder', uploadFolder);
        }

        // 使用统一的文件命名函数生成文件ID
        const fullId = await buildUniqueFileId(context, fileName, normalizedFileType);

        // 生成唯一标识符前缀（UUID格式），加在文件名前面
        const uniquePrefix = crypto.randomUUID();
        const lastSlashIndex = fullId.lastIndexOf('/');
        const filePath = lastSlashIndex === -1 
            ? `${uniquePrefix}_${fullId}` 
            : `${fullId.substring(0, lastSlashIndex + 1)}${uniquePrefix}_${fullId.substring(lastSlashIndex + 1)}`;

        // 获取 LFS 上传信息
        const huggingfaceAPI = new HuggingFaceAPI(hfChannel.token, hfChannel.repo, hfChannel.isPrivate || false);
        const uploadInfo = await huggingfaceAPI.getLfsUploadInfo(fileSize, filePath, sha256, fileSample);
        const ticketId = crypto.randomUUID();
        const completionTarget = uploadInfo?.uploadAction?.header?.chunk_size ? uploadInfo.uploadAction.href : null;
        const ticket = {
            ticketId, ownerId: guard.uploader?.id || null, fullId, filePath, channelName: hfChannel.name,
            sha256, fileSize, fileName, fileType: normalizedFileType, completionTarget,
            expiresAt: Date.now() + 3600000,
        };
        await getDatabase(env).put('manage@viaai@hf@' + fullId, JSON.stringify(ticket), { expirationTtl: 3600 });
        rewriteMultipartCompletionUrl(url, uploadInfo, fullId, ticketId);

        // 返回上传信息
        return createResponse(JSON.stringify({
            success: true,
            fullId,
            filePath,
            channelName: hfChannel.name,
            repo: hfChannel.repo,
            isPrivate: hfChannel.isPrivate || false,
            ...uploadInfo
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('getUploadUrl error:', error.message);
        return createResponse(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

function rewriteMultipartCompletionUrl(requestUrl, uploadInfo, fullId, ticketId) {
    const uploadAction = uploadInfo?.uploadAction;
    if (!uploadAction?.header?.chunk_size || !uploadAction.href) {
        return;
    }

    const originalCompletionUrl = uploadAction.href;
    uploadAction.href = `${requestUrl.origin}/upload/huggingface/completeMultipart?target=${encodeURIComponent(originalCompletionUrl)}&fullId=${encodeURIComponent(fullId)}&ticket=${encodeURIComponent(ticketId)}`;
}
