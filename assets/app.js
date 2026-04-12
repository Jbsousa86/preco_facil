// assets/app.js
// Frontend logic for Price Comparison MVP
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://localhost:3000'
    : 'https://preco-facil.onrender.com';
const form = document.getElementById('search-form');
const resultsContainer = document.getElementById('results');
let promoInterval; // Global interval for timers
let offersScrollInterval; // Carousel interval

function getFullUrl(path) {
    if (!path || path === 'null' || String(path).trim() === '') return '';
    const cleanPath = String(path).trim();
    if (cleanPath.startsWith('http') || cleanPath.startsWith('//')) return cleanPath;
    const finalPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    return `${API_BASE_URL}${finalPath}`;
}

if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const product = document.getElementById('product').value.trim();
        if (!product) return;

        resultsContainer.innerHTML = '<div style="text-align:center; padding:40px; color: #64748b;">🔍 Buscando melhores ofertas para "'+product+'"...</div>';

        // Update URL for shareability
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('q', product);
        window.history.pushState({}, '', newUrl);

        try {
            const res = await fetch(`${API_BASE_URL}/api/search?product=${encodeURIComponent(product)}`);
            if (!res.ok) throw new Error('Erro na resposta do servidor');
            const data = await res.json();

            if (data.length === 0) {
                resultsContainer.innerHTML = '<div style="text-align:center; padding:40px; color: #64748b;"><div style="font-size:3rem; margin-bottom:12px;">😔</div><p>Nenhum produto encontrado. Tente outro termo.</p></div>';
                return;
            }

            renderResults(data);
            document.getElementById('product').value = ''; // Reset input as requested
        } catch (err) {
            console.error(err);
            resultsContainer.innerHTML = '<div style="text-align:center; padding:40px; color: #ef4444;">Erro ao buscar preços. Tente novamente.</div>';
        }
    });
}

// Auto-search from URL param
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    if (query) {
        document.getElementById('product').value = query;
        form.dispatchEvent(new Event('submit'));
    }
});

function renderResults(data) {
    if (promoInterval) clearInterval(promoInterval);

    // Sorted by price (Promo price prioritized if active)
    const sorted = [...data].sort((a, b) => {
        const priceA = a.promo_price && new Date(a.promo_expires_at) > new Date() ? a.promo_price : a.price;
        const priceB = b.promo_price && new Date(b.promo_expires_at) > new Date() ? b.promo_price : b.price;
        return priceA - priceB;
    });

    // Top results spotlight (now showing up to 15)
    const spotlightItems = sorted.slice(0, 15);

    let html = `
        <div id="best-prices-spotlight" style="margin-bottom: 32px; background: #fff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <h3 style="margin:0 0 16px 0; color:var(--primary); display:flex; align-items:center; gap:8px; font-size:1.1rem;">
                <span style="font-size:1.5rem;">🔍</span> Os Melhores Preços
            </h3>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap:12px;">
                ${spotlightItems.map(p => {
                    const isPromo = p.promo_price && new Date(p.promo_expires_at) > new Date();
                    const finalPrice = isPromo ? p.promo_price : p.price;
                    return `
                    <div onclick="window.location.href='store_profile.html?id=${p.store_id}'" style="background:#fff; padding:10px; border-radius:12px; cursor:pointer; border:1px solid #f1f5f9; transition: transform 0.2s; display: flex; flex-direction: column; gap: 6px;">
                        <div style="width:100%; height:90px; background:#f1f5f9; border-radius:8px; overflow:hidden; position:relative;">
                            ${p.image_url ? `<img src="${getFullUrl(p.image_url)}" style="width:100%; height:100%; object-fit:cover;">` : '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#cbd5e1;">📦</div>'}
                            ${isPromo ? `<div style="position:absolute; top:4px; right:4px; background:var(--primary); color:#fff; font-size:0.55rem; padding:2px 6px; border-radius:4px; font-weight:800;">OFERTA</div>` : ''}
                        </div>
                        <div>
                            <span style="font-size:0.6rem; font-weight:700; color:#94a3b8; text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block;">${p.store_name}</span>
                            <h4 style="margin:2px 0; font-size:0.8rem; display:-webkit-box; -webkit-line-clamp:2; line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:2.4em;">${p.product_name}</h4>
                            <div style="font-size:1rem; font-weight:800; color:var(--success);">R$ ${parseFloat(finalPrice).toFixed(2)}</div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
            <button onclick="shareSearchResults()" style="margin-top:20px; background:#f8fafc; color:var(--primary); border:1px solid #e2e8f0; padding:10px 20px; border-radius:12px; font-weight:700; cursor:pointer; width:100%; display:flex; align-items:center; justify-content:center; gap:8px;">
                <span>📤</span> Compartilhar estes preços
            </button>
        </div>
    `;

    // All results (remaining ones or all)
    if (sorted.length > 15) {
        html += `
        <h3 style="margin-bottom: 20px; color:#64748b; font-size:1rem;">Mais resultados:</h3>
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap:12px;">
            ${sorted.slice(15).map(p => {
                const isPromo = p.promo_price && new Date(p.promo_expires_at) > new Date();
                const finalPrice = isPromo ? p.promo_price : p.price;
                return `
                <div onclick="window.location.href='store_profile.html?id=${p.store_id}'" style="background:#fff; padding:10px; border-radius:12px; cursor:pointer; border:1px solid #f1f5f9; display: flex; flex-direction: column; gap: 6px;">
                    <div style="width:100%; height:80px; background:#f1f5f9; border-radius:8px; overflow:hidden;">
                        ${p.image_url ? `<img src="${getFullUrl(p.image_url)}" style="width:100%; height:100%; object-fit:cover;">` : '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#cbd5e1;">📦</div>'}
                    </div>
                    <div>
                        <span style="font-size:0.6rem; font-weight:700; color:#94a3b8; text-transform:uppercase;">${p.store_name}</span>
                        <h4 style="margin:2px 0; font-size:0.8rem; display:-webkit-box; -webkit-line-clamp:1; line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">${p.product_name}</h4>
                        <div style="font-size:0.95rem; font-weight:800; color:var(--success);">R$ ${parseFloat(finalPrice).toFixed(2)}</div>
                    </div>
                </div>
                `;
            }).join('')}
        </div>
        `;
    }

    resultsContainer.innerHTML = html;
    startPromoTimers();
}

function startPromoTimers() {
    const update = () => {
        document.querySelectorAll('.promo-timer').forEach(el => {
            const end = new Date(el.dataset.expires).getTime();
            const now = new Date().getTime();
            const diff = end - now;

            if (diff <= 0) {
                el.innerText = 'Oferta encerrada';
                return;
            }

            const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);

            el.innerText = `⏳ Acaba em: ${h}h ${m}m ${s}s`;
        });
    };
    update();
    promoInterval = setInterval(update, 1000);
}

async function loadTrending() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/search/trending`);
        if (res.ok) {
            const terms = await res.json();
            const container = document.getElementById('trending-container');
            const tags = document.getElementById('trending-tags');

            if (terms.length > 0) {
                container.style.display = 'flex';
                tags.innerHTML = terms.map(t =>
                    `<span class="tag" onclick="searchTrending('${t.term}')">${t.term}</span>`
                ).join('');
            }
        }
    } catch (e) { console.error(e); }
}

window.searchTrending = (term) => {
    const input = document.getElementById('product');
    if (input) {
        input.value = term;
        // Search is now manual, user must click Buscar
    }
};

async function loadTrendingOffers() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/offers/trending`);
        if (res.ok) {
            const offers = await res.json();
            const container = document.getElementById('offers-container');
            const section = document.getElementById('offers-section');

            if (offers.length > 0) {
                section.style.display = 'block';
                container.innerHTML = offers.map(offer => {
                    const fullImageUrl = getFullUrl(offer.image_url);
                    return `
                    <div class="result-card" onclick="window.location.href='store_profile.html?id=${offer.store_id}'" style="flex: 0 0 240px; background:#fff; border-radius:12px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.1); border:1px solid #e2e8f0; cursor:pointer;">
                        ${fullImageUrl ? `<img src="${fullImageUrl}" style="width:100%; height:100px; object-fit:cover; border-radius:8px; margin-bottom:8px;">` : `<div style="height:100px; background:#f1f5f9; border-radius:8px; display:flex; align-items:center; justify-content:center; margin-bottom:8px;">📦</div>`}
                        <h4 style="margin:0 0 4px; font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${offer.product_name}</h4>
                        <div style="font-size:0.75rem; color:#64748b; margin-bottom:8px;">🏪 ${offer.store_name}</div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:#10b981; font-weight:700;">R$ ${parseFloat(offer.promo_price).toFixed(2)}</span>
                            <span style="font-size:0.65rem; color:#f59e0b; font-weight:700;">OFERTA 🔥</span>
                        </div>
                    </div>
                    `;
                }).join('');
            }
        }
    } catch (e) { console.error(e); }
}

// Global Init
document.addEventListener('DOMContentLoaded', () => {
    // Tracking
    fetch(`${API_BASE_URL}/api/track_visit`, { method: 'POST' }).catch(() => {});

    loadTrending();
    loadHeroPromotions();
    loadMerchants();
    loadCheapest();
});

async function loadCheapest() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/prices/cheapest`);
        if (res.ok) {
            const items = await res.json();
            const section = document.getElementById('cheapest-prices-section');
            const container = document.getElementById('cheapest-prices-container');
            if (items.length > 0) {
                section.style.display = 'block';
                // Show TOP 20
                container.innerHTML = items.slice(0, 20).map(p => {
                    const isPromo = p.promo_price && new Date(p.promo_expires_at) > new Date();
                    const finalPrice = isPromo ? p.promo_price : p.price;
                    return `
                    <div onclick="window.location.href='store_profile.html?id=${p.store_id}'" style="background:#fff; padding:8px; border-radius:12px; border:1px solid #e2e8f0; cursor:pointer; text-align:center; display: flex; flex-direction: column; gap: 4px; position:relative;">
                        <div style="position:absolute; top:4px; right:4px; background:var(--primary); color:#fff; font-size:0.55rem; padding:2px 6px; border-radius:4px; font-weight:800; z-index:1;">OFERTA 🔥</div>
                        <div style="width: 100%; height: 90px; background: #f1f5f9; border-radius: 8px; overflow: hidden; margin-bottom: 4px;">
                            ${p.image_url ? `<img src="${getFullUrl(p.image_url)}" style="width:100%; height:100%; object-fit:cover;">` : '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#94a3b8; font-size:1.5rem;">📦</div>'}
                        </div>
                        <div style="font-size: 1rem; font-weight: 800; color: var(--success);">R$ ${parseFloat(finalPrice).toFixed(2)}</div>
                        <span style="font-size:0.6rem; color:#94a3b8; font-weight:700; text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.store_name}</span>
                    </div>
                `;}).join('');
            }
        }
    } catch (e) { console.error(e); }
}

let heroCarouselIndex = 0;
async function loadHeroPromotions() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/banners`);
        const offers = await res.json();
        
        const section = document.getElementById('hero-carousel-section');
        const carousel = document.getElementById('hero-carousel');
        const dots = document.getElementById('hero-dots');
        
        if (offers.length === 0) return;
        
        section.style.display = 'block';
        
        carousel.innerHTML = offers.map((o, i) => {
            const link = (o.link_url && o.link_url !== 'null' && String(o.link_url).trim() !== '') ? o.link_url : '';
            const isActive = (i === 0);
            
            // Se tiver link, usa <a>, se não tiver usa <div>
            const tag = link ? 'a' : 'div';
            const hrefAttr = link ? `href="${link.startsWith('http') ? link : 'https://' + link}" target="_blank"` : '';
            
            return `
                <${tag} ${hrefAttr} class="carousel-slide" 
                     style="position:absolute; inset:0; opacity:${isActive?1:0}; display:${isActive?'block':'none'}; text-decoration:none; transition: opacity 0.8s ease; ${link ? 'cursor:pointer;' : 'cursor:default;'}" >
                    <img src="${getFullUrl(o.image_url)}" style="width:100%; height:100%; object-fit:cover;">
                    ${o.title ? `
                    <div style="position:absolute; inset:0; background:linear-gradient(transparent, rgba(0,0,0,0.7)); display:flex; flex-direction:column; justify-content:flex-end; padding:24px; color:#fff;">
                        <h2 style="margin:0; font-size:1.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">${o.title}</h2>
                    </div>
                    ` : ''}
                </${tag}>
            `;
        }).join('');
        
        dots.innerHTML = offers.map((_, i) => `
            <div class="dot" style="width:12px; height:4px; border-radius:2px; background:${i===0?'var(--primary)':'rgba(0,0,0,0.2)'}; transition: all 0.3s;"></div>
        `).join('');
        
        if (offers.length > 1) {
            if (window.heroCarouselTimer) clearInterval(window.heroCarouselTimer);
            window.heroCarouselTimer = setInterval(() => {
                const slides = carousel.querySelectorAll('.carousel-slide');
                const dotEls = dots.querySelectorAll('.dot');
                if(!slides.length) return;
                
                const prevSlide = slides[heroCarouselIndex];
                prevSlide.style.opacity = 0;
                // Remove do fluxo de cliques após a transição
                setTimeout(() => { 
                    if (prevSlide.style.opacity == "0") prevSlide.style.display = 'none'; 
                }, 800);
                
                dotEls[heroCarouselIndex].style.background = 'rgba(0,0,0,0.2)';
                dotEls[heroCarouselIndex].style.width = '12px';
                
                heroCarouselIndex = (heroCarouselIndex + 1) % offers.length;
                
                const nextSlide = slides[heroCarouselIndex];
                nextSlide.style.display = 'block';
                // Pequeno delay para o navegador registrar o display:block antes da opacidade
                setTimeout(() => { nextSlide.style.opacity = 1; }, 20);
                
                dotEls[heroCarouselIndex].style.background = 'var(--primary)';
                dotEls[heroCarouselIndex].style.width = '24px';
            }, 5000);
        }
        
    } catch (e) { console.error(e); }
}

async function loadMerchants() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/stores`);
        const stores = await res.json();
        const activeStores = stores.filter(s => !s.is_blocked);
        const allStoresContainer = document.getElementById('all-stores-container');
        if (allStoresContainer) {
            allStoresContainer.innerHTML = activeStores.map(s => {
                const hasPromo = s.has_promo; // This column already exists in our updated API
                return `
                <div onclick="window.location.href='store_profile.html?id=${s.id}'" style="display:flex; flex-direction:column; align-items:center; cursor:pointer; gap:8px; text-align:center; position:relative;">
                    ${hasPromo ? `<div style="position:absolute; top:-5px; right:-5px; background:#fbbf24; color:#fff; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.7rem; box-shadow:0 2px 4px rgba(0,0,0,0.2); z-index:2;">🔥</div>` : ''}
                    <div style="width:70px; height:70px; border-radius:50%; background:#fff; border:${hasPromo ? '2px solid #fbbf24' : '1px solid #e2e8f0'}; overflow:hidden; box-shadow:${hasPromo ? '0 0 10px rgba(251, 191, 36, 0.3)' : '0 1px 3px rgba(0,0,0,0.05)'};">
                        ${s.logo_url ? `<img src="${getFullUrl(s.logo_url)}" style="width:100%; height:100%; object-fit:cover;">` : `<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:1.5rem;">🏪</div>`}
                    </div>
                    <span style="font-size:0.75rem; font-weight:600; color:${hasPromo ? '#d97706' : '#1e293b'}; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${s.name}</span>
                </div>
            `;}).join('');
        }
    } catch (e) { console.error(e); }
}

// PWA Logic
let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
        installBtn.style.display = 'block';
        installBtn.onclick = () => {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => {
                deferredPrompt = null;
                installBtn.style.display = 'none';
            });
        };
    }
});

function shareSearchResults() {
    const term = document.getElementById('product').value;
    const url = window.location.href;
    
    if (navigator.share) {
        navigator.share({
            title: `Preços para ${term} - Mercado Local`,
            text: `Encontrei os melhores preços de ${term} no Mercado Local! Confira aqui:`,
            url: url
        }).catch(console.error);
    } else {
        const temp = document.createElement('input');
        document.body.appendChild(temp);
        temp.value = url;
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        alert('Link dos resultados copiado! 🚀');
    }
}

