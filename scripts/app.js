import { Storage } from './storage.js';
import { Filters } from './filters.js';

// --- State ---
const state = {
    ingredients: [],
    recipes: [],
    substitutes: {},
    selectedIngredients: new Set(Storage.get(Storage.KEYS.INGREDIENTS)),
    favorites: new Set(Storage.get(Storage.KEYS.FAVORITES)),
    filters: {
        maxTime: 999,
        vegOnly: false,
        budgetOnly: false,
        showFavoritesOnly: false
    }
};

// --- DOM Elements ---
const dom = {
    ingList: document.getElementById('ingredients-list'),
    recipeGrid: document.getElementById('recipes-grid'),
    search: document.getElementById('ingredient-search'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('toggle-sidebar'),
    sidebarClose: document.getElementById('close-sidebar'),
    clearBtn: document.getElementById('clear-ingredients'),
    filterTime: document.getElementById('filter-time'),
    filterVeg: document.getElementById('filter-veg'),
    filterBudget: document.getElementById('filter-budget'),
    favBtn: document.getElementById('show-favorites')
};

// --- Initialization ---
async function init() {
    try {
        // Загрузка JSON с учетом GitHub Pages (пути ./)
        const [ingRes, recRes, subRes] = await Promise.all([
            fetch('./data/ingredients.json'),
            fetch('./data/recipes.json'),
            fetch('./data/substitutes.json')
        ]);

        state.ingredients = await ingRes.json();
        state.recipes = await recRes.json();
        state.substitutes = await subRes.json();

        renderIngredients();
        processRecipes(); // Первичный рендер
        setupEventListeners();
    } catch (error) {
        console.error("Ошибка загрузки данных:", error);
        dom.recipeGrid.innerHTML = `<p style="color:red">Ошибка загрузки данных. Проверьте подключение и пути к файлам.</p>`;
    }
}

// --- Logic ---

function getRecipeMatch(recipe) {
    const required = recipe.required;
    let found = 0;
    const details = []; 

    required.forEach(reqId => {
        const ingName = state.ingredients.find(i => i.id === reqId)?.name || reqId;

        // 1. Прямое совпадение
        if (state.selectedIngredients.has(reqId)) {
            found++;
            details.push({ name: ingName, status: 'ok' });
            return;
        }

        // 2. Замена
        const possibleSubs = state.substitutes[reqId];
        if (possibleSubs) {
            const hasSub = possibleSubs.find(subId => state.selectedIngredients.has(subId));
            if (hasSub) {
                found += 0.8; 
                const subName = state.ingredients.find(i => i.id === hasSub)?.name || hasSub;
                details.push({ name: ingName, status: 'sub', subName });
                return;
            }
        }

        // 3. Отсутствует
        details.push({ name: ingName, status: 'missing' });
    });

    const percent = Math.round((found / required.length) * 100);
    return { ...recipe, matchPercent: percent, details };
}

function processRecipes() {
    let processed = state.recipes.map(getRecipeMatch);
    
    // Сортировка
    processed.sort((a, b) => b.matchPercent - a.matchPercent || a.time - b.time);

    // Фильтрация
    processed = Filters.filterRecipes(processed, state.filters);

    if (state.filters.showFavoritesOnly) {
        processed = processed.filter(r => state.favorites.has(r.id));
    }

    renderRecipes(processed);
}

// --- Rendering ---

function renderIngredients(filterText = '') {
    const list = Filters.searchIngredients(state.ingredients, filterText);
    const groups = {};

    list.forEach(ing => {
        if (!groups[ing.category]) groups[ing.category] = [];
        groups[ing.category].push(ing);
    });

    const html = Object.keys(groups).map(cat => `
        <div class="category-title">${cat}</div>
        ${groups[cat].map(ing => `
            <label class="ingredient-item">
                <input type="checkbox" value="${ing.id}" 
                    ${state.selectedIngredients.has(ing.id) ? 'checked' : ''}
                    onchange="window.toggleIngredient('${ing.id}')">
                ${ing.name}
            </label>
        `).join('')}
    `).join('');

    dom.ingList.innerHTML = html || '<p>Ничего не найдено</p>';
}

function renderRecipes(recipes) {
    if (recipes.length === 0) {
        dom.recipeGrid.innerHTML = `<div class="placeholder-text">Нет подходящих рецептов 🤷‍♂️</div>`;
        return;
    }

    dom.recipeGrid.innerHTML = recipes.map(r => {
        const isFav = state.favorites.has(r.id);
        const matchClass = r.matchPercent === 100 ? '' : (r.matchPercent > 50 ? 'medium' : 'low');
        
        return `
        <article class="recipe-card">
            <div class="card-img">
                 🍳
            </div>
            <div class="card-body">
                <div class="card-header">
                    <h3 class="card-title">${r.name}</h3>
                    <span class="match-badge ${matchClass}">${r.matchPercent}%</span>
                </div>
                <div class="card-meta">
                    <span>⏳ ${r.time} мин</span>
                    <span>${r.budget ? '💲 Эконом' : '💲💲'}</span>
                </div>
                <ul class="ing-list">
                    ${r.details.slice(0, 3).map(d => {
                        let className = 'status-' + d.status;
                        return `<li class="ing-item ${className}">${d.name}</li>`;
                    }).join('')}
                    ${r.details.length > 3 ? `<li style="color:#888; font-size:0.8rem">+ еще ${r.details.length - 3}</li>` : ''}
                </ul>
                <div class="card-actions">
                    <button class="btn-action" onclick="window.toggleFav('${r.id}')">
                        ${isFav ? '★' : '☆'}
                    </button>
                    <button class="btn-action btn-primary-outline" onclick="window.openRecipeModal('${r.id}')" style="flex:2; font-weight:bold;">
                        📖 Рецепт
                    </button>
                </div>
            </div>
        </article>
    `}).join('');
}

// --- Modal Logic ---
const modal = {
    overlay: document.getElementById('recipe-modal'),
    closeBtn: document.getElementById('close-modal'),
    title: document.getElementById('modal-title'),
    img: document.getElementById('modal-img'),
    steps: document.getElementById('modal-steps'),
    ingredients: document.getElementById('modal-ingredients')
};

window.openRecipeModal = (id) => {
    const recipe = state.recipes.find(r => r.id === id);
    if (!recipe) return;

    const matchData = getRecipeMatch(recipe);

    modal.title.textContent = recipe.name;
    modal.img.style.display = 'none'; // Пока скрываем картинку

    modal.ingredients.innerHTML = matchData.details.map(d => {
        const icon = d.status === 'ok' ? '✅' : (d.status === 'sub' ? '🔄' : '❌');
        const style = d.status === 'missing' ? 'opacity: 0.6' : '';
        const subText = d.status === 'sub' ? ` (замена: ${d.subName})` : '';
        return `<li style="${style}">${icon} ${d.name}${subText}</li>`;
    }).join('');

    if (recipe.instructions && recipe.instructions.length > 0) {
        modal.steps.innerHTML = recipe.instructions.map(step => `<li>${step}</li>`).join('');
    } else {
        modal.steps.innerHTML = '<p>Инструкция скоро появится...</p>';
    }

    modal.overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closeRecipeModal = () => {
    modal.overlay.classList.add('hidden');
    document.body.style.overflow = '';
};

// --- Handlers & Events ---
window.toggleIngredient = (id) => {
    if (state.selectedIngredients.has(id)) state.selectedIngredients.delete(id);
    else state.selectedIngredients.add(id);
    Storage.set(Storage.KEYS.INGREDIENTS, Array.from(state.selectedIngredients));
    processRecipes();
};

window.toggleFav = (id) => {
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    Storage.set(Storage.KEYS.FAVORITES, Array.from(state.favorites));
    processRecipes();
};

function setupEventListeners() {
    dom.search.addEventListener('input', (e) => renderIngredients(e.target.value));
    dom.clearBtn.addEventListener('click', () => {
        state.selectedIngredients.clear();
        Storage.set(Storage.KEYS.INGREDIENTS, []);
        renderIngredients();
        processRecipes();
    });
    dom.sidebarToggle.addEventListener('click', () => dom.sidebar.classList.add('open'));
    dom.sidebarClose.addEventListener('click', () => dom.sidebar.classList.remove('open'));
    dom.filterTime.addEventListener('change', (e) => { state.filters.maxTime = Number(e.target.value); processRecipes(); });
    dom.filterVeg.addEventListener('change', (e) => { state.filters.vegOnly = e.target.checked; processRecipes(); });
    dom.filterBudget.addEventListener('change', (e) => { state.filters.budgetOnly = e.target.checked; processRecipes(); });
    dom.favBtn.addEventListener('click', () => {
        state.filters.showFavoritesOnly = !state.filters.showFavoritesOnly;
        dom.favBtn.classList.toggle('active');
        processRecipes();
    });
    
    modal.closeBtn.addEventListener('click', window.closeRecipeModal);
    modal.overlay.addEventListener('click', (e) => {
        if (e.target === modal.overlay) window.closeRecipeModal();
    });
}

// Start
init();
