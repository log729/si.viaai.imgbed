/**
 * viaai.si 站群定制补丁：对（可能刚从上游同步下来的）frontend-dist 重新应用站群改动。
 * 幂等，可重复运行：node scripts/patch-dist.mjs
 *
 * 1. frontend-dist/index.html：站群元数据（title/description/canonical/OG/图标/viaai-site）+ 注入 viaai-nav.js
 * 2. viaai/overlay/* 拷贝到 frontend-dist/（viaai-nav.js、robots.txt、favicon.ico、apple-touch-icon.png、og.png）
 * 3. 重新生成 index.html.gz
 *
 * 不改上游压缩后的 JS（页脚 / 署名链接保持原样，符合 MIT 协议）。
 */
import { readFileSync, writeFileSync, copyFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'frontend-dist');
const OVERLAY = join(ROOT, 'viaai', 'overlay');

const SITE = 'imgbed.viaai.si';
const URL_ = `https://${SITE}/`;
const TITLE = '图床 - 一键上传，随处引用 | AI之路 imgbed.viaai.si';
const DESC = 'AI之路图床（imgbed.viaai.si）：为文章、笔记与项目准备的稳定图片与文件外链，支持多渠道存储、目录管理与 API。';
const KEYWORDS = '图床,图片外链,文件托管,图片上传,AI之路,viaai';

const BEGIN = '<!--viaai:begin-->';
const END = '<!--viaai:end-->';

const head = [
  BEGIN,
  `<meta name="viaai-site" content="${SITE}">`,
  `<link rel="canonical" href="${URL_}">`,
  '<link rel="icon" href="/favicon.ico" sizes="any">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<meta name="robots" content="index,follow,max-image-preview:large">',
  '<meta property="og:type" content="website">',
  '<meta property="og:site_name" content="AI之路">',
  '<meta property="og:locale" content="zh_CN">',
  `<meta property="og:title" content="${TITLE}">`,
  `<meta property="og:description" content="${DESC}">`,
  `<meta property="og:url" content="${URL_}">`,
  `<meta property="og:image" content="${URL_}og.png">`,
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta name="twitter:card" content="summary_large_image">',
  '<script defer src="/viaai-nav.js?v=2"></script>',
  END,
].join('');

const indexPath = join(DIST, 'index.html');
let html = readFileSync(indexPath, 'utf8');

// 去掉上一次注入的块，以及旧版本手工加的 viaai-site meta
html = html.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), '');
html = html.replace(/<meta name="viaai-site"[^>]*>/g, '');

// 去掉上游自带的图标 link（站群统一图标）；应用内 logo 用的是 /static/media/logo.png，不受影响
html = html.replace(/<link rel="(?:icon|apple-touch-icon|mask-icon)"[^>]*>/g, '');

html = html
  .replace(/<html lang="[^"]*"/, '<html lang="zh-CN"')
  .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${DESC}">`)
  .replace(/<meta name="keywords"[^>]*>/, `<meta name="keywords" content="${KEYWORDS}">`)
  .replace(/<meta name="author"[^>]*>/, '<meta name="author" content="AI之路">')
  .replace(/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`);

if (!html.includes('</head>')) throw new Error('index.html 缺少 </head>，上游结构已变，请检查补丁');
html = html.replace('</head>', `${head}</head>`);

writeFileSync(indexPath, html);
writeFileSync(`${indexPath}.gz`, gzipSync(Buffer.from(html), { level: 9 }));

for (const f of readdirSync(OVERLAY)) copyFileSync(join(OVERLAY, f), join(DIST, f));

console.log(`patched ${indexPath} (+ .gz), overlay: ${readdirSync(OVERLAY).join(', ')}`);
