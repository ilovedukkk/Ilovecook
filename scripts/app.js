document.addEventListener('DOMContentLoaded', () => {
    // --- State & DOM ---
    let recipes = [];
    let ingredients = [];
    let substitutes = {};
    let selectedIngredients = new Set();
    let activeTimer = null; // Для хранения ID интервала

    const els = {
        grid: document.getElementById('recipes-container'),
        ingList: document.getElementById('ingredients-list'),
        search: document.getElementById('global-search'),
        clearBtn: document.getElementById('clear-ingredients'),
        filters: document.querySelectorAll('.filter-pill'),
        themeBtn: document.getElementById('theme-toggle'),
        modal: document.getElementById('recipe-modal'),
        modalBody: document.getElementById('modal-body'),
        servingsSelect: document.getElementById('servings-select'),
        resultsTitle: document.getElementById('results-title'),
        timerToast: document.getElementById('timer-alert'),
        randomBtn: document.getElementById('random-btn'),
        timerCount: document.getElementById('timer-countdown'),
        timerStep: document.getElementById('timer-step-text'),
        stopTimerBtn: document.getElementById('stop-timer')
    };

    // --- 1. Init & Data Loading ---
    async function init() {
        try {
            // В реальном проекте загружаем JSON файлы
            // const r = await fetch('data/recipes.json'); recipes = await r.json();
            // Здесь используем заглушки для демонстрации (данные из ответа выше)
            
            // Загружаем данные (имитация fetch)
            const [recData, ingData, subData] = await Promise.all([
                fetch('data/recipes.json').then(r => r.json()),
                fetch('data/ingredients.json').then(r => r.json()),
                fetch('data/substitutes.json').then(r => r.json())
            ]);
            
            recipes = recData;
            ingredients = ingData;
            substitutes = subData;

            renderIngredients(ingredients);
            renderRecipes(); // Показываем все по умолчанию
            initTheme();
        } catch (e) {
            console.error("Ошибка инициализации:", e);
        }
    }

    // --- 2. Dark Mode Logic ---
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);

        els.themeBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const newTheme = current === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }

    function updateThemeIcon(theme) {
        els.themeBtn.querySelector('span').textContent = theme === 'light' ? 'dark_mode' : 'light_mode';
    }

    // --- 3. Ingredients Logic ---
    function renderIngredients(list) {
        els.ingList.innerHTML = '';
        list.forEach(ing => {
            const el = document.createElement('div');
            el.className = 'chip';
            el.textContent = ing.name;
            el.dataset.id = ing.id;
            el.onclick = () => toggleIngredient(ing.id, el);
            els.ingList.appendChild(el);
        });
    }

    function toggleIngredient(id, el) {
        if (selectedIngredients.has(id)) {
            selectedIngredients.delete(id);
            el.classList.remove('selected');
        } else {
            selectedIngredients.add(id);
            el.classList.add('selected');
        }
        
        const hasSelection = selectedIngredients.size > 0;
        els.clearBtn.classList.toggle('hidden', !hasSelection);
        
        // Пересчет рецептов
        renderRecipes();
    }

    els.clearBtn.addEventListener('click', () => {
        selectedIngredients.clear();
        document.querySelectorAll('.chip.selected').forEach(el => el.classList.remove('selected'));
        els.clearBtn.classList.add('hidden');
        renderRecipes();
    });

    // --- 4. Recipe Matching & Rendering ---
    function calculateMatch(recipe) {
        if (selectedIngredients.size === 0) return { percent: 0, missing: [] }; // Базовое состояние

        let total = 0;
        let matched = 0;
        const missing = [];

        recipe.ingredients.forEach(ing => {
            total++;
            if (selectedIngredients.has(ing.id)) {
                matched++;
            } else if (checkSubstitute(ing.id)) {
                matched += 0.8; // Замена дает неполный балл
            } else {
                missing.push(ing);
            }
        });

        return {
            percent: Math.round((matched / total) * 100),
            missing
        };
    }

    function checkSubstitute(ingId) {
        if (!substitutes[ingId]) return false;
        return substitutes[ingId].some(subId => selectedIngredients.has(subId));
    }

    function renderRecipes() {
        const activeCat = document.querySelector('.filter-pill.active').dataset.cat;
        const searchTerm = els.search.value.toLowerCase();
        const isSelectionMode = selectedIngredients.size > 0;

        // Фильтрация и Расчет
        let displayList = recipes.map(r => {
            const matchData = calculateMatch(r);
            return { ...r, ...matchData };
        }).filter(r => {
            // Фильтр категорий
            if (activeCat !== 'all' && r.category !== activeCat) return false;
            
            // Текстовый поиск (по названию или ингредиентам внутри рецепта)
            if (searchTerm) {
                const inTitle = r.title.toLowerCase().includes(searchTerm);
                const inIngs = r.ingredients.some(i => i.name.toLowerCase().includes(searchTerm));
                if (!inTitle && !inIngs) return false;
            }
            return true;
        });

        // Сортировка
        if (isSelectionMode) {
            displayList.sort((a, b) => b.percent - a.percent);
            els.resultsTitle.textContent = `Найденные рецепты (${displayList.length})`;
        } else {
            // Если ничего не выбрано, просто случайный порядок или по ID
            els.resultsTitle.textContent = activeCat === 'all' ? 'Все рецепты' : activeCat;
        }

        // Рендер HTML
        els.grid.innerHTML = '';
        
        if (displayList.length === 0) {
            els.grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted)">Ничего не найдено :(</div>';
            return;
        }

        displayList.forEach(r => {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            card.onclick = () => openModal(r);

            // Бейджик совпадения
            let badgeHTML = '';
            if (isSelectionMode) {
                const badgeClass = r.percent >= 80 ? 'high' : (r.percent >= 40 ? 'med' : 'low');
                badgeHTML = `<div class="match-badge ${badgeClass}">${r.percent}%</div>`;
            }

            card.innerHTML = `
                <div class="card-img" style="background-image: url('${r.image}')">
                    ${badgeHTML}
                </div>
                <div class="card-body">
                    <h3 class="card-title">${r.title}</h3>
                    <div class="card-meta">
                        <span class="meta-item"><span class="material-icons-round" style="font-size:16px">timer</span> ${r.time_total} мин</span>
                        <span class="meta-item"><span class="material-icons-round" style="font-size:16px">bar_chart</span> ${r.difficulty}</span>
                    </div>
                </div>
            `;
            els.grid.appendChild(card);
        });
    }

    // --- 5. Modal & Cooking Mode ---
    function openModal(recipe) {
        els.modal.classList.remove('hidden');
        
        // Генерация списка ингредиентов
        const ingsHTML = recipe.ingredients.map(ing => {
            let statusClass = '';
            let icon = 'radio_button_unchecked';
            
            if (selectedIngredients.has(ing.id)) {
                statusClass = 'has-ing';
                icon = 'check_circle';
            } else if (checkSubstitute(ing.id)) {
                statusClass = 'sub-ing';
                icon = 'cached';
            } else if (selectedIngredients.size > 0) {
                statusClass = 'no-ing';
                icon = 'cancel';
            }

            return `
                <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px solid var(--border)">
                    <span class="${statusClass}" style="display:flex; align-items:center; gap:6px;">
                        <span class="material-icons-round" style="font-size:16px">${icon}</span> ${ing.name}
                    </span>
                    <span style="color: var(--text-muted)">${ing.amount}</span>
                </div>
            `;
        }).join('');

        // Генерация шагов с таймерами
        const stepsHTML = recipe.steps.map((step, idx) => {
            const hasTimer = step.time > 0;
            const timerBtn = hasTimer 
                ? `<button class="btn-timer" onclick="startTimer(${step.time * 60}, 'Шаг ${idx+1}')">
                     <span class="material-icons-round">play_arrow</span> ${step.time} мин
                   </button>` 
                : '';

            return `
                <div class="step-row">
                    <div class="step-num">${idx + 1}</div>
                    <div class="step-content">
                        <div class="step-text">${step.text}</div>
                        ${timerBtn}
                    </div>
                </div>
            `;
        }).join('');

        els.modalBody.innerHTML = `
            <img src="${recipe.image}" style="width:100%; height:200px; object-fit:cover; border-radius:12px; margin-bottom:16px;">
            <h2 style="margin-bottom:8px">${recipe.title}</h2>
            <div style="margin-bottom:20px; color:var(--text-muted)">
                Источник: <a href="${recipe.source.url}" target="_blank" style="color:var(--primary)">${recipe.source.name}</a>
            </div>

            <h3 style="margin-bottom:12px">Ингредиенты</h3>
            <div style="margin-bottom:24px">${ingsHTML}</div>

            <h3 style="margin-bottom:12px">Приготовление</h3>
            <div>${stepsHTML}</div>
        `;
    }

    // --- 6. Timer Logic ---
    window.startTimer = (seconds, label) => {
        if (activeTimer) clearInterval(activeTimer);
        
        els.timerToast.classList.remove('hidden');
        els.timerStep.textContent = label;
        
        let remaining = seconds;
        updateTimerDisplay(remaining);

        activeTimer = setInterval(() => {
            remaining--;
            updateTimerDisplay(remaining);
            
            if (remaining <= 0) {
                clearInterval(activeTimer);
                alert(`⏰ Таймер для "${label}" завершен!`);
                els.timerToast.classList.add('hidden');
            }
        }, 1000);
    };

    function updateTimerDisplay(sec) {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        els.timerCount.textContent = `${m}:${s}`;
    }

    els.stopTimerBtn.addEventListener('click', () => {
        clearInterval(activeTimer);
        els.timerToast.classList.add('hidden');
    });

    // --- 7. Event Listeners ---
    els.filters.forEach(btn => {
        btn.addEventListener('click', () => {
            els.filters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderRecipes();
        });
    });

    els.search.addEventListener('input', renderRecipes);

    document.querySelectorAll('.close-modal').forEach(b => {
        b.addEventListener('click', () => els.modal.classList.add('hidden'));
    });
    
    // Закрытие по клику вне модалки
    els.modal.addEventListener('click', (e) => {
        if(e.target === els.modal) els.modal.classList.add('hidden');
    });

    // --- 8. Random Recipe Logic ---
    els.randomBtn.addEventListener('click', () => {
        if (recipes.length === 0) return;

        // 1. Добавляем класс анимации
        const icon = els.randomBtn.querySelector('span');
        icon.classList.add('rolling');

        // Убираем класс после анимации (чтобы можно было нажать снова)
        setTimeout(() => {
            icon.classList.remove('rolling');
        }, 600);

        // 2. Выбираем случайный рецепт
        const randomIndex = Math.floor(Math.random() * recipes.length);
        const randomRecipe = recipes[randomIndex];

        // 3. Открываем его!
        // Важно: мы также рассчитываем совпадения ингредиентов для него, 
        // даже если это случайный выбор
        const matchData = calculateMatch(randomRecipe);
        
        // Небольшая задержка, чтобы пользователь успел увидеть анимацию кубика
        setTimeout(() => {
            openModal({ ...randomRecipe, ...matchData });
        }, 300);
    });
    // Запуск
    init();
});
