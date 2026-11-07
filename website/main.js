// 首屏截图：按“布局 × 主题”切换真实应用截图
(function () {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const caption = document.getElementById('stage-caption');
    const captions = {
        classic: '经典布局：标签栏在上，强调色跟着当前网站变。',
        rail: '侧栏布局：标签页和收藏夹竖排在左侧，标题再长也看得全。',
    };
    const state = { layout: 'classic', theme: 'light' };

    function render() {
        stage.dataset.layout = state.layout;
        stage.dataset.theme = state.theme;
        const name = `${state.layout}-${state.theme}`;
        stage.querySelectorAll('[data-shot]').forEach((img) => {
            img.classList.toggle('on', img.dataset.shot === name);
        });
        stage.querySelectorAll('button[data-set]').forEach((b) => {
            b.setAttribute('aria-checked', String(state[b.dataset.set] === b.dataset.value));
        });
        caption.textContent = captions[state.layout];
    }

    stage.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-set]');
        if (!b) return;
        state[b.dataset.set] = b.dataset.value;
        render();
    });
    // 单选组里用方向键切换
    stage.addEventListener('keydown', (e) => {
        const b = e.target.closest('button[data-set]');
        if (!b || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        const group = [...b.parentElement.querySelectorAll('button')];
        const next = group[(group.indexOf(b) + (e.key === 'ArrowRight' ? 1 : group.length - 1)) % group.length];
        next.focus();
        next.click();
        e.preventDefault();
    });
    render();
})();
