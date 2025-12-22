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
        const [ingRes, recRes, subRes] = await Promise.all([
            fetch('data/ingredients.json'),
            fetch('data/recipes.json'),
            fetch('data/substitutes.json')
        ]);

        state.ingredients = await ingRes.json();
        state.recipes = await recRes.json();
        state.substitutes = await subRes.json();

        renderIngredients();
        processRecipes(); // Initial render
        setupEventListeners();
    } catch (error) {
        console.error("Ошибка загрузки данных:", error);
        dom.recipeGrid.innerHTML = `<p style="color:red">Ошибка загрузки данных. Проверьте подключение.</p>`;
    }
}

// --- Logic ---

function getRecipeMatch(recipe) {
    const required = recipe.required;
    let found = 0;
    const details = []; // { id, status: 'ok' | 'sub' | 'missing', name }

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
                // Считаем как 0.8 совпадения для сортировки, но как "наличие"
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
    // 1. Вычисляем совпадения
    let processed = state.recipes.map(getRecipeMatch);

    // 2. Сортировка: Сначала высокий процент, потом время
    processed.sort((a, b) => b.matchPercent - a.matchPercent || a.time - b.time);

    // 3. Фильтрация
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

    // Группировка
    list.forEach(ing => {
        if (!groups[ing.category]) groups[ing.category] = [];
        groups[ing.category].push(ing);
    });

    // Генерация HTML (эффективно через map join)
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
            <img src="${r.image}" alt="${r.name}" class="card-img" loading="lazy">
            <div class="card-body">
                <div class="card-header">
                    <h3 class="card-title">${r.name}</h3>
                    <span class="match-badge ${matchClass}">${r.matchPercent}%</span>
                </div>
                <div class="card-meta">
                    <span>⏳ ${r.time} мин</span>
                    <span>${r.budget ? '💲 Бюджетно' : '💲💲'}</span>
                </div>
                <ul class="ing-list">
                    ${r.details.map(d => {
                        let text = d.name;
                        let className = 'status-' + d.status;
                        if (d.status === 'sub') text += ` (замена: ${d.subName})`;
                        return `<li class="ing-item ${className}">${text}</li>`;
                    }).join('')}
                </ul>
                <div class="card-actions">
                    <button class="btn-action" onclick="window.toggleFav('${r.id}')">
                        ${isFav ? '★ В избранном' : '☆ В избранное'}
                    </button>
                    </div>
            </div>
        </article>
    `}).join('');
}

// --- Global Handlers (for HTML access) ---
window.toggleIngredient = (id) => {
    if (state.selectedIngredients.has(id)) {
        state.selectedIngredients.delete(id);
    } else {
        state.selectedIngredients.add(id);
    }
    Storage.set(Storage.KEYS.INGREDIENTS, Array.from(state.selectedIngredients));
    processRecipes();
};

window.toggleFav = (id) => {
    if (state.favorites.has(id)) {
        state.favorites.delete(id);
    } else {
        state.favorites.add(id);
    }
    Storage.set(Storage.KEYS.FAVORITES, Array.from(state.favorites));
    processRecipes(); // Re-render to update button state
};

// --- Event Listeners ---
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

    // Filters
    dom.filterTime.addEventListener('change', (e) => { state.filters.maxTime = Number(e.target.value); processRecipes(); });
    dom.filterVeg.addEventListener('change', (e) => { state.filters.vegOnly = e.target.checked; processRecipes(); });
    dom.filterBudget.addEventListener('change', (e) => { state.filters.budgetOnly = e.target.checked; processRecipes(); });
    
    dom.favBtn.addEventListener('click', () => {
        state.filters.showFavoritesOnly = !state.filters.showFavoritesOnly;
        dom.favBtn.classList.toggle('active');
        processRecipes();
    });
}

// Start
init();
