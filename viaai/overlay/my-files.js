(() => {
  const strings = {
    zh: ['我的文件','返回上传','登录','文件外链公开；只有你和管理员可以管理这些文件。','文件','操作','上一页','下一页','查看 / 下载','复制链接','删除','确定删除此文件？此操作无法撤销。','正在加载…','暂无文件','操作失败，请刷新后重试。','请登录通行证账号；管理员请使用管理后台。','链接已复制','已删除'],
    en: ['My files','Upload','Sign in','File links are public. Only you and administrators can manage your files.','File','Actions','Previous','Next','View / download','Copy link','Delete','Delete this file permanently?','Loading…','No files yet','Operation failed. Refresh and try again.','Sign in with your passport account. Administrators can use the dashboard.','Link copied','Deleted'],
    es: ['Mis archivos','Subir','Iniciar sesión','Los enlaces son públicos. Solo tú y los administradores podéis gestionar tus archivos.','Archivo','Acciones','Anterior','Siguiente','Ver / descargar','Copiar enlace','Eliminar','¿Eliminar este archivo definitivamente?','Cargando…','No hay archivos','Error. Actualiza e inténtalo de nuevo.','Inicia sesión con tu cuenta. Los administradores pueden usar el panel.','Enlace copiado','Eliminado'],
    fr: ['Mes fichiers','Importer','Connexion','Les liens sont publics. Seuls vous et les administrateurs pouvez gérer vos fichiers.','Fichier','Actions','Précédent','Suivant','Voir / télécharger','Copier le lien','Supprimer','Supprimer définitivement ce fichier ?','Chargement…','Aucun fichier','Échec. Actualisez et réessayez.','Connectez-vous avec votre compte. Les administrateurs peuvent utiliser le tableau de bord.','Lien copié','Supprimé'],
    pt: ['Meus arquivos','Enviar','Entrar','Os links são públicos. Só você e administradores podem gerenciar seus arquivos.','Arquivo','Ações','Anterior','Próxima','Ver / baixar','Copiar link','Excluir','Excluir este arquivo permanentemente?','Carregando…','Nenhum arquivo','Falha. Atualize e tente novamente.','Entre com sua conta. Administradores podem usar o painel.','Link copiado','Excluído'],
    ru: ['Мои файлы','Загрузить','Войти','Ссылки общедоступны. Управлять файлами можете только вы и администраторы.','Файл','Действия','Назад','Далее','Просмотр / скачать','Копировать ссылку','Удалить','Удалить этот файл навсегда?','Загрузка…','Нет файлов','Ошибка. Обновите страницу и повторите.','Войдите в аккаунт. Администраторы могут использовать панель управления.','Ссылка скопирована','Удалено'],
    ja: ['マイファイル','アップロード','ログイン','ファイルのリンクは公開されます。管理できるのは本人と管理者だけです。','ファイル','操作','前へ','次へ','表示 / ダウンロード','リンクをコピー','削除','このファイルを完全に削除しますか？','読み込み中…','ファイルはありません','失敗しました。再読み込みしてお試しください。','アカウントにログインしてください。管理者は管理画面をご利用ください。','リンクをコピーしました','削除しました'],
    hi: ['मेरी फ़ाइलें','अपलोड','लॉग इन','फ़ाइल लिंक सार्वजनिक हैं। केवल आप और व्यवस्थापक आपकी फ़ाइलों को प्रबंधित कर सकते हैं।','फ़ाइल','कार्रवाइयाँ','पिछला','अगला','देखें / डाउनलोड','लिंक कॉपी करें','हटाएँ','यह फ़ाइल स्थायी रूप से हटाएँ?','लोड हो रहा है…','कोई फ़ाइल नहीं','विफल। पेज रीफ़्रेश करके फिर प्रयास करें।','अपने खाते में लॉग इन करें। व्यवस्थापक डैशबोर्ड का उपयोग कर सकते हैं।','लिंक कॉपी हुआ','हटा दिया गया'],
  };
  const language = /(?:^|;\s*)viaai_lang=([a-z]{2})/.exec(document.cookie)?.[1] || 'zh';
  const t = strings[language] || strings.en;
  document.documentElement.lang = strings[language] ? language : 'en';
  document.title = t[0] + ' · AI之路';
  const $ = id => document.getElementById(id);
  ['title','home','login','notice','file-heading','action-heading','prev','next'].forEach((id, i) => $(id).textContent = t[i]);
  $('login').href = 'https://id.viaai.si' + (language === 'zh' ? '' : '/' + (strings[language] ? language : 'en')) + '/login?return=' + encodeURIComponent('https://imgbed.viaai.si/my-files.html');
  let start = 0, total = 0, busy = false;
  const count = 30;
  const status = text => { $('status').textContent = text; };
  function controls() { $('prev').disabled = busy || start === 0; $('next').disabled = busy || start + count >= total; }
  async function render() {
    busy = true; controls(); status(t[12]); $('files').replaceChildren();
    try {
      const response = await fetch('/api/my-files?start=' + start + '&count=' + count, { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 401 || response.status === 403) { total = 0; $('login').hidden = false; status(t[15]); return; }
      if (!response.ok) throw new Error();
      const data = await response.json(); total = data.totalCount;
      $('login').hidden = true;
      for (const file of data.files) {
        const row = document.createElement('tr'), name = document.createElement('td'), actions = document.createElement('td');
        name.textContent = file.name;
        const date = document.createElement('small'); date.textContent = file.uploadedAt ? new Date(Number(file.uploadedAt)).toLocaleString() : ''; name.append(date);
        // Only construct same-origin file URLs, even if the API response is malformed.
        const fileUrl = '/file/' + file.id.split('/').map(encodeURIComponent).join('/');
        const link = document.createElement('a'); link.href = fileUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = t[8]; actions.append(link);
        const copy = document.createElement('button'); copy.textContent = t[9]; copy.onclick = async () => { try { await navigator.clipboard.writeText(location.origin + fileUrl); status(t[16]); } catch { status(t[14]); } }; actions.append(copy);
        const remove = document.createElement('button'); remove.textContent = t[10]; remove.onclick = async () => {
          if (busy || !confirm(t[11])) return;
          busy = true; remove.disabled = true; controls();
          try {
            const response = await fetch('/api/my-files?id=' + encodeURIComponent(file.id), { method: 'DELETE', credentials: 'same-origin' });
            if (!response.ok) throw new Error();
            if (data.files.length === 1 && start > 0) start = Math.max(0, start - count);
            await render(); status(t[17]);
          } catch { status(t[14]); } finally { busy = false; remove.disabled = false; controls(); }
        }; actions.append(remove);
        row.append(name, actions); $('files').append(row);
      }
      $('page').textContent = `${Math.floor(start / count) + 1} / ${Math.max(1, Math.ceil(total / count))}`;
      status(data.files.length ? `${start + 1}–${Math.min(start + count, total)} / ${total}` : t[13]);
    } catch { status(t[14]); } finally { busy = false; controls(); }
  }
  $('prev').onclick = () => { start = Math.max(0, start - count); render(); };
  $('next').onclick = () => { start += count; render(); };
  render();
})();
