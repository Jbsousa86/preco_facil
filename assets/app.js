// assets/app.js
// Frontend logic for Price Comparison MVP
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : 'https://preco-facil.onrender.com';
const form = document.getElementById('search-form');
const resultsContainer = document.getElementById('results');
let promoInterval; // Variável para controlar o intervalo do cronômetro
let offersScrollInterval; // Variável para o carrossel

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const product = document.getElementById('product').value.trim();
  if (!product) return;

  resultsContainer.innerHTML = '<div class="loading">Buscando melhores preços...</div>';

  try {
    const res = await fetch(`${API_BASE_URL}/api/search?product=${encodeURIComponent(product)}`);
    if (!res.ok) throw new Error('Erro na resposta do servidor');
    const data = await res.json();

    if (data.length === 0) {
      resultsContainer.innerHTML = '<div class="empty-state">Nenhum produto encontrado. Tente outro termo.</div>';
      return;
    }

    renderResults(data);
  } catch (err) {
    console.error(err);
    resultsContainer.innerHTML = '<div class="error">Erro ao buscar preços. Tente novamente.</div>';
  }
});

function renderResults(stores) {
  if (promoInterval) clearInterval(promoInterval); // Limpa cronômetros anteriores

  let html = '<div class="results-list">';
  stores.forEach((store, index) => {
    const isBestPrice = index === 0;
    const isPromo = store.promo_price && new Date(store.promo_expires_at) > new Date();
    const finalPrice = isPromo ? store.promo_price : store.price;
    const cleanPhone = store.phone ? store.phone.replace(/\D/g, '') : '';
    const fullImageUrl = store.image_url && !store.image_url.startsWith('http')
        ? `${API_BASE_URL}${store.image_url}`
        : store.image_url;
    
    const safeStoreName = store.store_name.replace(/'/g, "\\'");
    const safeProductName = (store.product_name || document.getElementById('product').value).replace(/'/g, "\\'");

    html += `
      <div class="result-card ${isBestPrice ? 'best-price' : ''}" onclick="window.open('store_profile.html?id=${store.store_id}', '_blank')" style="cursor: pointer;" title="Clique para ver todos os produtos desta loja">
        ${fullImageUrl ? `<img src="${fullImageUrl}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; margin-right: 10px;">` : ''}
        <div class="store-info">
          <h3>${store.store_name}</h3>
          ${store.category ? `<span style="font-size: 0.7rem; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; color: #666; margin-right: 5px;">${store.category}</span>` : ''}
          <span class="rating">${store.rating} ⭐</span>
          ${store.street ? `<p style="font-size: 0.8rem; color: #6b7280; margin: 4px 0;">📍 ${store.street}, ${store.number || ''} - ${store.neighborhood || ''}</p>` : ''}
          ${store.phone ? `
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                <span style="font-size: 0.8rem; color: #6b7280;">📞 ${store.phone}</span>
                <a href="https://wa.me/55${cleanPhone}" target="_blank" onclick="event.stopPropagation()" style="background: #25D366; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; text-decoration: none; font-weight: bold;">WhatsApp</a>
            </div>` : ''}
        </div>
        <div class="price-info">
          ${isPromo 
            ? `<span style="text-decoration: line-through; color: #9ca3af; font-size: 0.8rem;">R$ ${parseFloat(store.price).toFixed(2)}</span>` 
            : ''}
          <span class="price" style="${isPromo ? 'color: #d97706;' : ''}">R$ ${parseFloat(finalPrice).toFixed(2)}</span>
          ${isBestPrice ? '<span class="badge">Melhor Preço</span>' : ''}
          ${isPromo ? `<div class="promo-timer" data-expires="${store.promo_expires_at}" style="font-size: 0.75rem; color: #d97706; margin-top: 5px; font-weight: bold;"></div>` : ''}
          <button onclick="shareOffer(event, '${safeStoreName}', '${safeProductName}', '${finalPrice}', '${store.store_id}')" style="background: #2563eb; border: none; border-radius: 4px; color: #fff; cursor: pointer; margin-top: 8px; padding: 4px 8px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 0.75rem;" onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">
            <span>📤</span> Compartilhar
          </button>
        </div>
      </div>
    `;
  });
  html += '</div>';
  resultsContainer.innerHTML = html;
  startPromoTimers();
}

// Função para iniciar e atualizar os cronômetros
function startPromoTimers() {
  const update = () => {
    document.querySelectorAll('.promo-timer').forEach(el => {
      const end = new Date(el.dataset.expires).getTime();
      const now = new Date().getTime();
      const diff = end - now;

      if (diff <= 0) {
        el.innerText = 'Oferta encerrada';
        el.style.color = '#888';
        return;
      }

      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      el.innerText = `⏳ Acaba em: ${h}h ${m}m ${s}s`;
    });
  };
  update(); // Executa imediatamente
  promoInterval = setInterval(update, 1000); // Atualiza a cada segundo
}

// Carregar termos mais buscados
async function loadTrending() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/search/trending`);
        if (res.ok) {
            const terms = await res.json();
            const container = document.getElementById('trending-container');
            const tags = document.getElementById('trending-tags');
            
            if (terms.length > 0) {
                container.style.display = 'block';
                tags.innerHTML = terms.map(t => 
                    `<span class="trending-tag" onclick="searchTrending('${t.term}')">${t.term}</span>`
                ).join('');
            }
        }
    } catch (e) { console.error(e); }
}

window.searchTrending = (term) => {
    document.getElementById('product').value = term;
    document.getElementById('search-form').dispatchEvent(new Event('submit'));
};

window.shareOffer = (event, storeName, productName, price, storeId) => {
    event.stopPropagation();
    const text = `🔥 Oferta Imperdível: ${productName}\n🏪 ${storeName}\n💰 R$ ${parseFloat(price).toFixed(2)}\n\nConfira no Mercado Local:`;
    const url = `${window.location.origin}/store_profile.html?id=${storeId}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Oferta Mercado Local',
            text: text,
            url: url
        }).catch(err => console.log('Erro ao compartilhar:', err));
    } else {
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
        window.open(whatsappUrl, '_blank');
    }
};

// Carregar Ofertas em Destaque
async function loadTrendingOffers() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/offers/trending`);
        if (res.ok) {
            const offers = await res.json();
            const container = document.getElementById('offers-container');
            const section = document.getElementById('offers-section');

            if (offers.length > 0) {
                section.style.display = 'block';
                
                // Estilo de carrossel para o container de ofertas
                container.style.display = 'flex';
                container.style.overflowX = 'auto';
                container.style.gap = '15px';
                container.style.paddingBottom = '10px';
                container.style.scrollbarWidth = 'thin';

                container.innerHTML = offers.map(offer => {
                    const cleanPhone = offer.phone ? offer.phone.replace(/\D/g, '') : '';
                    const fullImageUrl = offer.image_url && !offer.image_url.startsWith('http')
                        ? `${API_BASE_URL}${offer.image_url}`
                        : offer.image_url;
                    const safeStoreName = offer.store_name.replace(/'/g, "\\'");
                    const safeProductName = offer.product_name.replace(/'/g, "\\'");
                    return `
                    <div class="result-card" onclick="window.open('store_profile.html?id=${offer.store_id}', '_blank')" style="flex: 0 0 auto; width: 290px; cursor: pointer; border: 1px solid #fcd34d; background: #fffbeb; margin-bottom: 0;">
                        ${fullImageUrl ? `<img src="${fullImageUrl}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; margin-right: 10px;">` : ''}
                        <div class="store-info" style="overflow: hidden; flex: 1;">
                            <h3 style="color: #1f2937; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${offer.product_name}</h3>
                            <div style="font-size: 0.8rem; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"> ${offer.store_name}</div>
                            ${offer.phone ? `
                                <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                                    <a href="https://wa.me/55${cleanPhone}?text=Ol%C3%A1%20vim%20pela%20plataforma%20mercado%20local." target="_blank" onclick="event.stopPropagation()" style="background: #25D366; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; text-decoration: none; font-weight: bold;">WhatsApp</a>
                                </div>` : ''}
                        </div>
                        <div class="price-info" style="min-width: 85px; text-align: right;">
                            <span style="text-decoration: line-through; color: #9ca3af; font-size: 0.7rem; display: block;">R$ ${parseFloat(offer.price).toFixed(2)}</span>
                            <span class="price" style="color: #d97706; font-size: 1.1rem; display: block;">R$ ${parseFloat(offer.promo_price).toFixed(2)}</span>
                            <div class="promo-timer" data-expires="${offer.promo_expires_at}" style="font-size: 0.65rem; color: #d97706; margin-top: 2px; font-weight: bold;"></div>
                            <button onclick="shareOffer(event, '${safeStoreName}', '${safeProductName}', '${offer.promo_price}', '${offer.store_id}')" style="background: #2563eb; border: none; border-radius: 4px; color: #fff; cursor: pointer; margin-top: 5px; padding: 4px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 0.7rem; transition: background 0.2s;" onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">
                                <span>🔥</span>Compartilhar Ofertas!
                            </button>
                        </div>
                    </div>
                    `;
                    
                }).join('');
                startPromoTimers(); // Inicia os cronômetros

                // Auto-scroll a cada 5 segundos
                if (offersScrollInterval) clearInterval(offersScrollInterval);
                offersScrollInterval = setInterval(() => {
                    const cardWidth = 305; // 290px card + 15px gap
                    if (container.scrollLeft + container.clientWidth >= container.scrollWidth - 10) {
                        container.scrollTo({ left: 0, behavior: 'smooth' });
                    } else {
                        container.scrollBy({ left: cardWidth, behavior: 'smooth' });
                    }
                }, 5000);
            }
        }
    } catch (e) { console.error(e); }
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(() => console.log('Service Worker registered'))
    .catch(err => console.error('Service Worker registration failed:', err));
}

document.addEventListener('DOMContentLoaded', async () => {
    // Rastreia a visita
    try {
        fetch(`${API_BASE_URL}/api/track_visit`, { method: 'POST' });
    } catch (e) {
        console.error('Erro ao rastrear visita:', e);
    }

    loadTrending();
    loadTrendingOffers();
    const merchantBlock = document.getElementById('merchant-block');

    if (merchantBlock) {
        try {
            const res = await fetch(`${API_BASE_URL}/api/stores`);
            if (res.ok) {
                const stores = await res.json();
                if (stores.length > 0) {
                    const storesList = stores.map(store => {
                        const fullLogoUrl = store.logo_url && !store.logo_url.startsWith('http')
                            ? `${API_BASE_URL}${store.logo_url}`
                            : store.logo_url;

                        if (store.is_blocked) {
                            return `
                            <div style="flex: 0 0 auto; width: 80px; display: flex; flex-direction: column; align-items: center; margin-right: 10px; opacity: 0.5; filter: grayscale(100%); cursor: not-allowed;" title="Loja Indisponível">
                                ${fullLogoUrl ? `<img src="${fullLogoUrl}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #777; margin-bottom: 5px;">` : `<div style="width: 50px; height: 50px; border-radius: 50%; background: #555; display: flex; align-items: center; justify-content: center; border: 2px solid #777; margin-bottom: 5px;">🔒</div>`}
                                <span style="font-size: 0.8rem; color: #fff; text-align: center; line-height: 1.2;">${store.name}</span>
                            </div>`;
                        }

                        const borderStyle = store.has_promo 
                            ? 'border: 3px solid #FFD700; box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);' 
                            : 'border: 2px solid #2563eb;';
                        
                        return `
                        <div onclick="window.location.href='store_profile.html?id=${store.id}'" style="flex: 0 0 auto; width: 80px; display: flex; flex-direction: column; align-items: center; cursor: pointer; margin-right: 10px;" title="Ver perfil da loja">
                            ${fullLogoUrl ? `<img src="${fullLogoUrl}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; ${borderStyle} margin-bottom: 5px;">` : `<div style="width: 50px; height: 50px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; ${borderStyle} margin-bottom: 5px;">🏪</div>`}
                            <span style="font-size: 0.8rem; color: #fff; text-align: center; line-height: 1.2;">${store.name}</span>
                            ${store.has_promo ? '<span style="font-size: 0.6rem; color: #FFD700; font-weight: bold;">OFERTAS</span>' : ''}
                        </div>
                    `}).join('');
                    
                    merchantBlock.innerHTML = `
                        <h3>Comerciantes Parceiros</h3>
                        <div style="margin-top: 15px; display: flex; overflow-x: auto; padding-bottom: 10px; scrollbar-width: thin;">
                            ${storesList}
                        </div>
                    `;
                }
            }
        } catch (err) {
            console.error('Erro ao carregar lojas', err);
        }
    }

    // Footer Global - JBSousaTech
    const footer = document.createElement('footer');
    footer.innerHTML = `
        <div id="footer-copy" style="text-align: center; padding: 20px; margin-top: 40px; border-top: 1px solid var(--border-color, #e5e7eb); color: var(--text-muted, #6b7280); font-size: 0.9rem; user-select: none; cursor: default;">
            &copy; ${new Date().getFullYear()} JBSousaTech - Todos os direitos reservados
        </div>
    `;
    document.body.appendChild(footer);

    // Menu Secreto (5 cliques no rodapé)
    let clickCount = 0;
    let clickTimer;
    document.getElementById('footer-copy').addEventListener('click', () => {
        clickCount++;
        clearTimeout(clickTimer);
        if (clickCount === 5) {
            const choice = prompt('Acesso Restrito:\n1. Lojista');
            if (choice === '1') window.location.href = 'login.html';
            clickCount = 0;
        }
        clickTimer = setTimeout(() => clickCount = 0, 1000);
    });
});
