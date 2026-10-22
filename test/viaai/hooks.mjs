// 测试用模块解析钩子：functions/ 里有无扩展名的相对导入（Cloudflare 打包器能解析，Node 不能），
// 以及没装依赖时的 @aws-sdk/* 、@cloudflare/*、@sentry/*（本测试不会真的调用它们）。
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STUB = 'data:text/javascript,' + encodeURIComponent(
    'const C=class{constructor(){}};' +
    'export const S3Client=C,GetObjectCommand=C,CopyObjectCommand=C,DeleteObjectCommand=C,PutObjectCommand=C,' +
    'CreateMultipartUploadCommand=C,UploadPartCommand=C,AbortMultipartUploadCommand=C,CompleteMultipartUploadCommand=C;' +
    'export default ()=>()=>new Response(null);'
);

export async function resolve(specifier, context, next) {
    if (/^@(aws-sdk|cloudflare|sentry)\//.test(specifier)) return { url: STUB, shortCircuit: true };
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.(m?js|json)$/.test(specifier) && context.parentURL?.startsWith('file:')) {
        const url = new URL(specifier + '.js', context.parentURL);
        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
}
