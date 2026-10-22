// 过渡页 / 无权限提示的纯函数：在 vm 里执行 viaai-login.js（没有 document 时只导出 window.__viaaiGate）
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../viaai/overlay/viaai-login.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox);
const G = sandbox.window.__viaaiGate;
const LANGS = ['zh', 'en', 'hi', 'es', 'fr', 'pt', 'ru', 'ja'];
const HAN = /[㐀-鿿]/;

test('8 种语言，词典 key 与条数一致', () => {
    assert.deepEqual([...G.SUPPORTED], LANGS);
    const ref = G.TEXT.zh;
    for (const l of LANGS) {
        const t = G.TEXT[l];
        assert.deepEqual(Object.keys(t).sort(), Object.keys(ref).sort(), l);
        assert.equal(t.feats.length, ref.feats.length, l);
        for (const [k, v] of Object.entries(t)) {
            for (const s of [].concat(v)) assert.ok(typeof s === 'string' && s.trim(), `${l}.${k}`);
        }
        assert.match(t.dBody, /\{name\}/, l);
    }
});

test('非中日语言的文案里不夹汉字；中日语言各有自己的字', () => {
    for (const l of LANGS) {
        const all = Object.values(G.TEXT[l]).flat().join('');
        if (l === 'zh' || l === 'ja') assert.match(all, HAN, l);
        else assert.doesNotMatch(all, HAN, l);
    }
    // 各语言之间不是复制粘贴的英文
    for (const l of LANGS.filter(x => x !== 'en')) assert.notEqual(G.TEXT[l].title, G.TEXT.en.title, l);
});

test('语言选择：cookie 优先，其次页面 lang，否则中文', () => {
    assert.equal(G.pickLang('ja', 'en'), 'ja');
    assert.equal(G.pickLang(null, 'zh-CN'), 'zh');
    assert.equal(G.pickLang(undefined, 'fr'), 'fr');
    assert.equal(G.pickLang('de', 'en-US'), 'en');
    assert.equal(G.pickLang('de', 'de'), 'zh');
    assert.equal(G.pickLang('', ''), 'zh');
});

test('通行证链接：中文无语言前缀，其余 /<lang>；return 完整编码', () => {
    const ret = G.homeUrl('https://imgbed.viaai.si');
    assert.equal(ret, 'https://imgbed.viaai.si/');
    assert.equal(G.idUrl('zh', 'login', ret), 'https://id.viaai.si/login?return=https%3A%2F%2Fimgbed.viaai.si%2F');
    assert.equal(G.idUrl('en', 'login', ret), 'https://id.viaai.si/en/login?return=https%3A%2F%2Fimgbed.viaai.si%2F');
    assert.equal(G.idUrl('ja', 'register', ret), 'https://id.viaai.si/ja/register?return=https%3A%2F%2Fimgbed.viaai.si%2F');
    for (const l of LANGS) assert.ok(G.idUrl(l, 'login', ret).startsWith(l === 'zh' ? 'https://id.viaai.si/login?' : `https://id.viaai.si/${l}/login?`));
    assert.equal(G.mainUrl('zh'), 'https://viaai.si/');
    assert.equal(G.mainUrl('ja'), 'https://viaai.si/ja');
});

test('视图判定', () => {
    const anon = { valid: false, userRequired: true, passportLogin: true };
    const ok = { valid: true, authType: 'user', passportLogin: true, uploadAllowed: true };
    const denied = { valid: true, authType: 'user', passportLogin: true, uploadAllowed: false };
    assert.equal(G.viewFor(anon, '/login'), 'gate');
    assert.equal(G.viewFor(anon, '/'), 'gate');
    assert.equal(G.viewFor(null, '/login'), 'gate', '请求失败：/login 也要有登录按钮');
    assert.equal(G.viewFor(null, '/'), null);
    assert.equal(G.viewFor(ok, '/'), null, '已登录看到正常上传页');
    assert.equal(G.viewFor(ok, '/login'), 'redirect-home');
    assert.equal(G.viewFor(denied, '/'), 'denied');
    assert.equal(G.viewFor(denied, '/login'), 'denied');
    assert.equal(G.viewFor({ valid: true, authType: 'admin', passportLogin: true, uploadAllowed: true }, '/'), null);
    // 后端没开通行证（PASSPORT_LOGIN=off 回滚）：什么都不显示，保留上游登录页
    assert.equal(G.viewFor({ valid: false, userRequired: true }, '/login'), null);
    // 旧后端没有 uploadAllowed 字段：当作可上传
    assert.equal(G.viewFor({ valid: true, authType: 'user', passportLogin: true }, '/'), null);
});

test('文案占位符替换', () => {
    assert.equal(G.fill(G.TEXT.en.dBody, { name: 'bob' }), 'The image host is currently limited to the site owner. Signed in as: bob');
    assert.equal(G.fill('x {name} y', {}), 'x  y');
});
