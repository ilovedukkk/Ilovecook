document.addEventListener('DOMContentLoaded', () => {
    // --- State & DOM ---
    let recipes = [];
    let shoppingList = JSON.parse(localStorage.getItem('ilovecook_shopping')) || [];
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
        shopBtn: document.getElementById('shop-btn'),
        shopDownloadBtn: document.getElementById('download-shop'),
        shopCount: document.getElementById('shop-count'),
        shopModal: document.getElementById('shopping-modal'),
        shopList: document.getElementById('shopping-list-items'),
        shopInput: document.getElementById('shop-input'),
        shopAddBtn: document.getElementById('shop-add-btn'),
        shopClearBtn: document.getElementById('clear-shop'),
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
        const servingsVal = els.servingsSelect.value; // Получаем значение фильтра порций
        const isSelectionMode = selectedIngredients.size > 0;

        // Фильтрация
        let displayList = recipes.map(r => {
            const matchData = calculateMatch(r);
            return { ...r, ...matchData };
        }).filter(r => {
            // 1. Фильтр категорий
            if (activeCat !== 'all' && r.category !== activeCat) return false;
            
            // 2. Текстовый поиск
            if (searchTerm) {
                const inTitle = r.title.toLowerCase().includes(searchTerm);
                const inIngs = r.ingredients.some(i => i.name.toLowerCase().includes(searchTerm));
                if (!inTitle && !inIngs) return false;
            }

            // 3. Фильтр порций (НОВОЕ)
            if (servingsVal !== 'any') {
                // Если в JSON нет поля servings, считаем по умолчанию 4
                const s = r.servings || 4; 
                
                if (servingsVal === '1' && s > 2) return false; // Ищем маленькие, а рецепт большой
                if (servingsVal === '3' && (s < 3 || s > 4)) return false;
                if (servingsVal === '5' && s < 5) return false;
            }

            return true;
        });

        // Сортировка (без изменений)
        if (isSelectionMode) {
            displayList.sort((a, b) => b.percent - a.percent);
            els.resultsTitle.textContent = `Найденные рецепты (${displayList.length})`;
        } else {
            els.resultsTitle.textContent = activeCat === 'all' ? 'Все рецепты' : activeCat;
        }

        // Рендер (без изменений)
        els.grid.innerHTML = '';
        
        if (displayList.length === 0) {
            els.grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted)">Ничего не найдено :(</div>';
            return;
        }

        displayList.forEach(r => {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            card.onclick = () => openModal(r);

            let badgeHTML = '';
            if (isSelectionMode) {
                const badgeClass = r.percent >= 80 ? 'high' : (r.percent >= 40 ? 'med' : 'low');
                badgeHTML = `<div class="match-badge ${badgeClass}">${r.percent}%</div>`;
            }
            
            // Добавим отображение порций в карточку
            const servingsText = r.servings ? `${r.servings} порц.` : '';

            card.innerHTML = `
                <div class="card-img" style="background-image: url('${r.image}')">
                    ${badgeHTML}
                </div>
                <div class="card-body">
                    <h3 class="card-title">${r.title}</h3>
                    <div class="card-meta">
                        <span class="meta-item"><span class="material-icons-round" style="font-size:16px">timer</span> ${r.time_total} мин</span>
                        <span class="meta-item"><span class="material-icons-round" style="font-size:16px">restaurant</span> ${servingsText}</span>
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
            let actionBtn = ''; // Кнопка действия

            // Логика статусов (есть / замена / нет)
            if (selectedIngredients.has(ing.id)) {
                statusClass = 'has-ing';
                icon = 'check_circle';
            } else if (checkSubstitute(ing.id)) {
                statusClass = 'sub-ing';
                icon = 'cached';
                // Даже если есть замена, можно захотеть купить оригинал
                actionBtn = getShopBtnHTML(ing.name); 
            } else {
                if (selectedIngredients.size > 0) {
                    statusClass = 'no-ing';
                    icon = 'cancel';
                }
                // Если продукта нет - предлагаем купить
                actionBtn = getShopBtnHTML(ing.name);
            }

            return `
                <div style="display:flex; align-items:center; padding: 8px 0; border-bottom: 1px solid var(--border)">
                    <span class="${statusClass}" style="display:flex; align-items:center; gap:6px; flex-grow:1">
                        <span class="material-icons-round" style="font-size:18px">${icon}</span> 
                        ${ing.name} <span style="color: var(--text-muted); font-size:0.9em">(${ing.amount})</span>
                    </span>
                    ${actionBtn}
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

    // --- Обновленная логика закрытия окон ---

    // 1. Закрытие по кнопке "Крестик" (работает для всех окон)
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            els.modal.classList.add('hidden');     // Закрыть рецепт
            els.shopModal.classList.add('hidden'); // Закрыть список покупок
        });
    });
    
    // 2. Закрытие по клику на темный фон (Overlay)
    window.addEventListener('click', (e) => {
        if (e.target === els.modal) {
            els.modal.classList.add('hidden');
        }
        if (e.target === els.shopModal) {
            els.shopModal.classList.add('hidden');
        }
    });

    // 3. Закрытие по кнопке ESC (для удобства)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            els.modal.classList.add('hidden');
            els.shopModal.classList.add('hidden');
        }
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

    // Слушаем изменение выпадающего списка
    els.servingsSelect.addEventListener('change', renderRecipes);
   
    // --- 9. Shopping List Logic ---
    
    // Вспомогательная функция для генерации кнопки
    function getShopBtnHTML(name) {
        const isInList = shoppingList.some(item => item.text === name);
        if (isInList) {
            return `<button class="btn-add-shop added" onclick="removeFromCart('${name}', this)">
                <span class="material-icons-round" style="font-size:14px">check</span> В списке
            </button>`;
        } else {
            return `<button class="btn-add-shop" onclick="addToCart('${name}', this)">
                <span class="material-icons-round" style="font-size:14px">add</span> Купить
            </button>`;
        }
    }

    // Глобальные функции (чтобы работали из HTML строки)
    window.addToCart = (name, btn) => {
        if (!shoppingList.some(i => i.text === name)) {
            shoppingList.push({ text: name, done: false });
            saveShop();
            if(btn) {
                btn.className = 'btn-add-shop added';
                btn.innerHTML = '<span class="material-icons-round" style="font-size:14px">check</span> В списке';
                btn.onclick = () => window.removeFromCart(name, btn);
            }
        }
    };

    window.removeFromCart = (name, btn) => {
        shoppingList = shoppingList.filter(i => i.text !== name);
        saveShop();
        if(btn) {
            btn.className = 'btn-add-shop';
            btn.innerHTML = '<span class="material-icons-round" style="font-size:14px">add</span> Купить';
            btn.onclick = () => window.addToCart(name, btn);
        }
        renderShopList(); // Если мы удаляем из модалки списка
    };

    function saveShop() {
        localStorage.setItem('ilovecook_shopping', JSON.stringify(shoppingList));
        updateShopUI();
    }

    function updateShopUI() {
        // Обновляем бейджик
        const count = shoppingList.filter(i => !i.done).length;
        els.shopCount.textContent = count;
        els.shopCount.classList.toggle('hidden', count === 0);
        renderShopList();
    }

    function renderShopList() {
        if (!els.shopList) return;
        els.shopList.innerHTML = '';
        
        shoppingList.forEach((item, idx) => {
            const li = document.createElement('li');
            li.className = `shop-item ${item.done ? 'done' : ''}`;
            li.innerHTML = `
                <input type="checkbox" class="shop-checkbox" ${item.done ? 'checked' : ''} onchange="toggleDone(${idx})">
                <span onclick="toggleDone(${idx})">${item.text}</span>
                <button class="btn-delete" onclick="deleteShopItem(${idx})">
                    <span class="material-icons-round">delete</span>
                </button>
            `;
            els.shopList.appendChild(li);
        });
    }

    window.toggleDone = (idx) => {
        shoppingList[idx].done = !shoppingList[idx].done;
        saveShop();
    };

    window.deleteShopItem = (idx) => {
        shoppingList.splice(idx, 1);
        saveShop();
    };

    // Слушатели событий списка
    els.shopBtn.addEventListener('click', () => els.shopModal.classList.remove('hidden'));
    
    // Добавление вручную
    const addCustom = () => {
        const val = els.shopInput.value.trim();
        if(val) {
            window.addToCart(val);
            els.shopInput.value = '';
        }
    };
    els.shopAddBtn.addEventListener('click', addCustom);
    els.shopInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') addCustom() });

    els.shopClearBtn.addEventListener('click', () => {
        if(confirm('Очистить весь список?')) {
            shoppingList = [];
            saveShop();
        }
    });

// --- 10. PDF Export Logic (OVERLAY METHOD - САМЫЙ НАДЕЖНЫЙ) ---
    if (els.shopDownloadBtn) {
        els.shopDownloadBtn.addEventListener('click', () => {
            if (shoppingList.length === 0) {
                alert('Список покупок пуст!');
                return;
            }

            const originalText = els.shopDownloadBtn.textContent;
            els.shopDownloadBtn.disabled = true;
            els.shopDownloadBtn.textContent = '⏳';

            // 1. Создаем "Оверлей" (Белый лист поверх сайта)
            // Это гарантирует, что html2pdf увидит элементы и не выдаст ошибку
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.backgroundColor = '#ffffff';
            overlay.style.zIndex = '99999'; // Поверх всего
            overlay.style.display = 'flex';
            overlay.style.justifyContent = 'center';
            overlay.style.paddingTop = '50px';

            // 2. Контейнер листа A4
            const container = document.createElement('div');
            container.style.width = '600px';
            container.style.padding = '40px';
            container.style.backgroundColor = 'white'; // Белый фон для PDF
            container.style.fontFamily = 'Arial, sans-serif'; // Простой шрифт без ошибок
            container.style.color = '#000';

            // Формируем HTML списка (без сложных иконок, чтобы не ломалось)
            const date = new Date().toLocaleDateString();
            const itemsHTML = shoppingList.map(item => `
                <div style="border-bottom: 1px solid #ddd; padding: 12px 0; font-size: 18px; display: flex; align-items: center;">
                    <span style="font-weight: bold; margin-right: 15px; color: ${item.done ? 'green' : '#333'}">
                        ${item.done ? '[ V ]' : '[___]'}
                    </span>
                    <span style="${item.done ? 'text-decoration: line-through; color: #999;' : ''}">
                        ${item.text}
                    </span>
                </div>
            `).join('');

            container.innerHTML = `
                <h1 style="color: #ff6b6b; margin: 0 0 10px 0; text-align: center;">Ilovecook</h1>
                <p style="color: #666; text-align: center; margin-bottom: 40px;">Список покупок от ${date}</p>
                <div>${itemsHTML}</div>
                <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #ccc;">Сгенерировано в Ilovecook</div>
            `;

            overlay.appendChild(container);
            document.body.appendChild(overlay);

            // 3. Ждем отрисовку и сохраняем
            setTimeout(() => {
                const opt = {
                    margin:       0,
                    filename:     `shopping-list-${date}.pdf`,
                    image:        { type: 'jpeg', quality: 0.98 },
                    html2canvas:  { scale: 2, useCORS: true, scrollY: 0 },
                    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };

                html2pdf()
                    .set(opt)
                    .from(container) // Снимаем именно контейнер внутри оверлея
                    .save()
                    .then(() => {
                        document.body.removeChild(overlay); // Убираем белый экран
                        els.shopDownloadBtn.disabled = false;
                        els.shopDownloadBtn.textContent = originalText;
                    })
                    .catch(err => {
                        console.error(err);
                        alert('Ошибка создания PDF.');
                        document.body.removeChild(overlay);
                        els.shopDownloadBtn.disabled = false;
                        els.shopDownloadBtn.textContent = originalText;
                    });
            }, 50); // Задержка 0.5 сек для стабильности
        });
    }
    
    // Запуск
    init();
    updateShopUI();
});
