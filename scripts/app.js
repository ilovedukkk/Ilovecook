import { Storage } from './storage.js';
import { Filters } from './filters.js';

const state = {
    ingredients: [],
    recipes: [],
    substitutes: {},
    selectedIngredients: new Set(Storage.get(Storage.KEYS.INGREDIENTS)),
    favorites: new Set(Storage.get(Storage.KEYS.FAVORITES)),
    shoppingList: new Set(Storage.get(Storage.KEYS.SHOPPING)),
    filters: { maxTime: 999, vegOnly: false, budgetOnly: false, showFavoritesOnly: false },
    darkMode: localStorage.getItem('fc_dark_mode') === 'true' // Состояние темы
};

const dom = {
    // ... (старые селекторы)
    sidebar: document.getElementById('sidebar'),
    recipeGrid: document.getElementById('recipes-grid'),
    ingList: document.getElementById('ingredients-list'),
    shoppingBadge: document.getElementById('shopping-badge'),
    shoppingListItems: document.getElementById('shopping-list-items'),
    drawer: document.getElementById('shopping-drawer'),
    drawerOverlay: document.getElementById('drawer-overlay'),
    toast: document.getElementById('toast'),
    themeToggle: document.getElementById('theme-toggle') // Кнопка темы
};

async function init() {
    try {
        // Применяем тему сразу
        if (state.darkMode) document.body.classList.add('dark-mode');
        updateThemeIcon();

        const [ingRes, recRes, subRes] = await Promise.all([
            fetch('./data/ingredients.json'),
            fetch('./data/recipes.json'),
            fetch('./data/substitutes.json')
        ]);
        state.ingredients = await ingRes.json();
        state.recipes = await recRes.json();
        state.substitutes = await subRes.json();

        renderIngredients();
        processRecipes();
        updateShoppingBadge();
        setupEvents();
    } catch (e) {
        console.error(e);
        dom.recipeGrid.innerHTML = `<div style="text-align:center; margin-top:20px;">Ошибка загрузки данных</div>`;
    }
}

// ... (функции getRecipeMatch и processRecipes остаются теми же) ...
function getRecipeMatch(recipe) {
    const required = recipe.required;
    let found = 0;
    const details = [];
    required.forEach(reqId => {
        const ing = state.ingredients.find(i => i.id === reqId);
        const name = ing ? ing.name : reqId;
        if (state.selectedIngredients.has(reqId)) {
            found++;
            details.push({ id: reqId, name, status: 'ok' });
        } else {
            const subs = state.substitutes[reqId] || [];
            const hasSub = subs.find(s => state.selectedIngredients.has(s));
            if (hasSub) {
                found += 0.8;
                const subName = state.ingredients.find(i => i.id === hasSub)?.name || hasSub;
                details.push({ id: reqId, name, status: 'sub', subName });
            } else {
                details.push({ id: reqId, name, status: 'missing' });
            }
        }
    });
    const percent = Math.round((found / required.length) * 100);
    return { ...recipe, matchPercent: percent, details };
}

function processRecipes() {
    let processed = state.recipes.map(getRecipeMatch);
    processed.sort((a, b) => b.matchPercent - a.matchPercent || a.time - b.time);
    processed = Filters.filterRecipes(processed, state.filters);
    if (state.filters.showFavoritesOnly) {
        processed = processed.filter(r => state.favorites.has(r.id));
    }
    renderRecipes(processed);
}

function renderRecipes(recipes) {
    if (recipes.length === 0) {
        dom.recipeGrid.innerHTML = `<div style="text-align:center; grid-column:1/-1; color:var(--text-sec);"><h3>🤷‍♂️ Рецептов не найдено</h3><p>Попробуйте изменить фильтры</p></div>`;
        return;
    }

    dom.recipeGrid.innerHTML = recipes.map(r => {
        const isFav = state.favorites.has(r.id);
        const matchClass = r.matchPercent === 100 ? '' : (r.matchPercent > 50 ? 'medium' : 'low');
        const dots = r.details.slice(0, 5).map(d => `<div class="ing-dot dot-${d.status === 'ok' ? 'ok' : (d.status === 'sub' ? 'sub' : 'miss')}"></div>`).join('');
        
        // КАРТИНКА ДОБАВЛЕНА ЗДЕСЬ
        const imgHtml = r.image ? `<img src="${r.image}" class="card-img" alt="${r.name}" loading="lazy">` : '';

        return `
        <article class="recipe-card">
            ${imgHtml}
            <div class="card-body">
                <div class="card-header">
                    <h3 class="card-title">${r.name}</h3>
                    <span class="match-badge ${matchClass}">${r.matchPercent}%</span>
                </div>
                <div class="ing-preview">${dots}</div>
                <div class="card-meta">
                    <span>⏱ ${r.time} мин</span>
                    <span>${r.budget ? '💵 Эконом' : '💎'}</span>
                </div>
                <div class="card-actions">
                    <button class="btn-action" onclick="window.toggleFav('${r.id}')">${isFav ? '❤️' : '🤍'}</button>
                    <button class="btn-action btn-primary-outline" onclick="window.openRecipeModal('${r.id}')">📖 Рецепт</button>
                </div>
            </div>
        </article>
        `;
    }).join('');
}

// ... (renderIngredients, updateShoppingBadge, renderShoppingList, modal logic - ОСТАВЛЯЕМ КАК БЫЛО в прошлом коде) ...
function renderIngredients(filter = '') {
    const list = Filters.searchIngredients(state.ingredients, filter);
    const groups = {};
    list.forEach(i => { if(!groups[i.category]) groups[i.category] = []; groups[i.category].push(i); });
    dom.ingList.innerHTML = Object.keys(groups).map(cat => `
        <div class="category-title">${cat}</div>
        ${groups[cat].map(ing => `
            <label class="ingredient-item">
                <input type="checkbox" value="${ing.id}" ${state.selectedIngredients.has(ing.id) ? 'checked' : ''} onchange="window.toggleIng('${ing.id}')">
                ${ing.name}
            </label>
        `).join('')}
    `).join('');
}
function updateShoppingBadge() {
    const count = state.shoppingList.size;
    dom.shoppingBadge.textContent = count;
    dom.shoppingBadge.classList.toggle('hidden', count === 0);
}
function renderShoppingList() {
    const list = Array.from(state.shoppingList);
    if (list.length === 0) {
        dom.shoppingListItems.innerHTML = '';
        document.getElementById('shopping-empty').classList.remove('hidden');
        return;
    }
    document.getElementById('shopping-empty').classList.add('hidden');
    dom.shoppingListItems.innerHTML = list.map(item => `
        <li>
            <input type="checkbox" onclick="this.parentElement.classList.toggle('checked')">
            ${item}
            <button onclick="window.removeShoppingItem('${item}')" style="margin-left:auto; border:none; background:none; cursor:pointer; color:var(--text);">✕</button>
        </li>
    `).join('');
}
window.addToShoppingList = (missingItems) => {
    let count = 0;
    missingItems.forEach(item => { if (!state.shoppingList.has(item)) { state.shoppingList.add(item); count++; } });
    Storage.set(Storage.KEYS.SHOPPING, Array.from(state.shoppingList));
    updateShoppingBadge();
    showToast(`Добавлено ${count} продуктов`);
};
window.removeShoppingItem = (item) => {
    state.shoppingList.delete(item);
    Storage.set(Storage.KEYS.SHOPPING, Array.from(state.shoppingList));
    renderShoppingList();
    updateShoppingBadge();
};
window.openRecipeModal = (id) => {
    const recipe = state.recipes.find(r => r.id === id);
    if (!recipe) return;
    const match = getRecipeMatch(recipe);
    document.getElementById('modal-title').textContent = recipe.name;
    const ingListEl = document.getElementById('modal-ingredients');
    const missingNames = [];
    ingListEl.innerHTML = match.details.map(d => {
        if (d.status === 'missing') missingNames.push(d.name);
        const icon = d.status === 'ok' ? '✅' : (d.status === 'sub' ? '🔄' : '❌');
        const style = d.status === 'missing' ? 'color: var(--danger)' : '';
        return `<li style="${style}">${icon} ${d.name} ${d.subName ? `(замени на ${d.subName})` : ''}</li>`;
    }).join('');
    const addBtn = document.getElementById('add-missing-btn');
    if (missingNames.length > 0) {
        addBtn.style.display = 'block';
        addBtn.onclick = () => window.addToShoppingList(missingNames);
    } else {
        addBtn.style.display = 'none';
    }
    document.getElementById('modal-steps').innerHTML = (recipe.instructions || []).map(s => `<li>${s}</li>`).join('');
    document.getElementById('recipe-modal').classList.remove('hidden');
    window.switchTab('ing');
};
window.switchTab = (tab) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab-btn[onclick="window.switchTab('${tab}')"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
};
function showToast(msg) {
    dom.toast.textContent = msg;
    dom.toast.classList.remove('hidden');
    setTimeout(() => dom.toast.classList.add('hidden'), 3000);
}
window.toggleIng = (id) => { state.selectedIngredients.has(id) ? state.selectedIngredients.delete(id) : state.selectedIngredients.add(id); Storage.set(Storage.KEYS.INGREDIENTS, Array.from(state.selectedIngredients)); processRecipes(); };
window.toggleFav = (id) => { state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id); Storage.set(Storage.KEYS.FAVORITES, Array.from(state.favorites)); processRecipes(); };
window.closeRecipeModal = () => document.getElementById('recipe-modal').classList.add('hidden');

// --- THEME LOGIC ---
function updateThemeIcon() {
    dom.themeToggle.textContent = state.darkMode ? '🌙' : '☀️';
}
function setupEvents() {
    // Theme Event
    dom.themeToggle.onclick = () => {
        state.darkMode = !state.darkMode;
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('fc_dark_mode', state.darkMode);
        updateThemeIcon();
    };

    // Standard Events
    dom.sidebar.querySelector('#close-sidebar').onclick = () => dom.sidebar.classList.remove('open');
    document.getElementById('toggle-sidebar').onclick = () => dom.sidebar.classList.add('open');
    document.getElementById('clear-ingredients').onclick = () => { state.selectedIngredients.clear(); Storage.set(Storage.KEYS.INGREDIENTS, []); renderIngredients(); processRecipes(); };
    document.getElementById('ingredient-search').oninput = (e) => renderIngredients(e.target.value);
    document.getElementById('filter-veg').onchange = (e) => { state.filters.vegOnly = e.target.checked; processRecipes(); };
    document.getElementById('filter-budget').onchange = (e) => { state.filters.budgetOnly = e.target.checked; processRecipes(); };
    document.getElementById('filter-time').onchange = (e) => { state.filters.maxTime = Number(e.target.value); processRecipes(); };
    document.getElementById('show-favorites').onclick = (e) => { state.filters.showFavoritesOnly = !state.filters.showFavoritesOnly; e.target.classList.toggle('active'); processRecipes(); };
    document.getElementById('random-recipe-btn').onclick = () => { if (state.recipes.length) window.openRecipeModal(state.recipes[Math.floor(Math.random() * state.recipes.length)].id); };
    
    // Shopping Drawer Events
    const toggleDrawer = (open) => { dom.drawer.classList.toggle('open', open); dom.drawerOverlay.classList.toggle('hidden', !open); if(open) renderShoppingList(); };
    document.getElementById('open-shopping-list').onclick = () => toggleDrawer(true);
    document.getElementById('close-shopping').onclick = () => toggleDrawer(false);
    dom.drawerOverlay.onclick = () => toggleDrawer(false);
    document.getElementById('clear-shopping').onclick = () => { state.shoppingList.clear(); Storage.set(Storage.KEYS.SHOPPING, []); renderShoppingList(); updateShoppingBadge(); };
    document.getElementById('share-shopping').onclick = () => { navigator.clipboard.writeText("Купить: \n" + Array.from(state.shoppingList).join('\n')).then(() => showToast('Скопировано!')); };
}

init();
