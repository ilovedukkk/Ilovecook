document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let allIngredients = [];
    let allRecipes = [];
    let substitutes = {};
    
    let selectedIngredients = new Set();
    let favorites = JSON.parse(localStorage.getItem('ilovecook_favorites')) || [];
    let shoppingList = JSON.parse(localStorage.getItem('ilovecook_shopping')) || [];

    // --- DOM Elements ---
    const ingredientsListEl = document.getElementById('ingredients-list');
    const ingredientSearch = document.getElementById('ingredient-search');
    const recipesContainer = document.getElementById('recipes-container');
    const selectedCountEl = document.getElementById('selected-count');
    const modal = document.getElementById('recipe-modal');
    const modalBody = document.getElementById('modal-body');
    const shoppingModal = document.getElementById('shopping-modal');
    const shoppingListItems = document.getElementById('shopping-list-items');

    // --- Init ---
    async function loadData() {
        try {
            const [ingRes, recRes, subRes] = await Promise.all([
                fetch('data/ingredients.json'),
                fetch('data/recipes.json'),
                fetch('data/substitutes.json')
            ]);

            allIngredients = await ingRes.json();
            allRecipes = await recRes.json();
            substitutes = await subRes.json();

            renderIngredients(allIngredients);
            // Восстанавливаем выбранные ингредиенты из localStorage, если нужно (опционально)
            // Но пока просто рендерим пустой список рецептов
            updateRecipesList();
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            ingredientsListEl.innerHTML = '<div style="color:red">Ошибка загрузки данных. Проверьте консоль.</div>';
        }
    }

    loadData();

    // --- Ingredients Logic ---
    function renderIngredients(list) {
        ingredientsListEl.innerHTML = '';
        list.forEach(ing => {
            const chip = document.createElement('div');
            chip.className = `ingredient-chip ${selectedIngredients.has(ing.id) ? 'selected' : ''}`;
            chip.textContent = ing.name;
            chip.dataset.id = ing.id;
            chip.onclick = () => toggleIngredient(ing.id);
            ingredientsListEl.appendChild(chip);
        });
    }

    function toggleIngredient(id) {
        if (selectedIngredients.has(id)) {
            selectedIngredients.delete(id);
        } else {
            selectedIngredients.add(id);
        }
        
        // Обновляем UI чипов
        const chip = document.querySelector(`.ingredient-chip[data-id="${id}"]`);
        if(chip) chip.classList.toggle('selected');
        
        selectedCountEl.textContent = selectedIngredients.size;
        updateRecipesList();
    }

    ingredientSearch.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allIngredients.filter(i => i.name.toLowerCase().includes(term));
        renderIngredients(filtered);
    });

    document.getElementById('clear-ingredients').addEventListener('click', () => {
        selectedIngredients.clear();
        selectedCountEl.textContent = 0;
        document.querySelectorAll('.ingredient-chip').forEach(c => c.classList.remove('selected'));
        updateRecipesList();
    });

    // --- Recipe Matching Logic (Core) ---
    function calculateMatch(recipe) {
        let totalRequired = 0;
        let matched = 0;
        let missing = [];

        recipe.ingredients.forEach(reqIng => {
            if (!reqIng.required) return; // Игнорируем необязательные при расчете жесткого %

            totalRequired++;
            
            // 1. Прямое совпадение
            if (selectedIngredients.has(reqIng.id)) {
                matched++;
            } 
            // 2. Проверка замен (Substitutes)
            else if (checkSubstitute(reqIng.id)) {
                matched += 0.8; // Замена дает не полный балл, а чуть меньше (опциональная логика)
            } else {
                missing.push(reqIng.name);
            }
        });

        const percent = totalRequired === 0 ? 100 : Math.round((matched / totalRequired) * 100);
        return { percent, missing };
    }

    function checkSubstitute(ingId) {
        if (!substitutes[ingId]) return false;
        // Проверяем, есть ли у пользователя хоть одна альтернатива из списка замен
        return substitutes[ingId].some(subId => selectedIngredients.has(subId));
    }

    // --- Rendering Recipes ---
    function updateRecipesList() {
        const catFilter = document.getElementById('filter-category').value;
        const diffFilter = document.getElementById('filter-difficulty').value;

        // Расчет и фильтрация
        let processedRecipes = allRecipes.map(recipe => {
            const matchData = calculateMatch(recipe);
            return { ...recipe, ...matchData };
        });

        // Сортировка: сначала по проценту (убывание), потом по отсутствующим
        processedRecipes.sort((a, b) => b.percent - a.percent);

        // Фильтры
        processedRecipes = processedRecipes.filter(r => {
            if (catFilter !== 'all' && r.category !== catFilter) return false;
            if (diffFilter !== 'all' && r.difficulty !== diffFilter) return false;
            return true;
        });

        // Рендер
        recipesContainer.innerHTML = '';
        
        if (processedRecipes.length === 0 && selectedIngredients.size > 0) {
            recipesContainer.innerHTML = '<div class="empty-state">Нет подходящих рецептов :(</div>';
            return;
        }

        if (selectedIngredients.size === 0) {
            recipesContainer.innerHTML = '<div class="empty-state">Выберите ингредиенты, чтобы начать!</div>';
            return; // Можно убрать return, если хотим показывать все рецепты сразу
        }

        processedRecipes.forEach(recipe => {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            card.onclick = () => openRecipeModal(recipe);
            
            let badgeClass = 'low';
            if (recipe.percent >= 90) badgeClass = 'high';
            else if (recipe.percent >= 50) badgeClass = 'medium';

            const missingText = recipe.missing.length > 0 
                ? `Не хватает: ${recipe.missing.slice(0, 3).join(', ')}${recipe.missing.length > 3 ? '...' : ''}` 
                : 'Все ингредиенты есть!';

            card.innerHTML = `
                <div class="card-image" style="background-image: url('${recipe.image}')">
                    <div class="match-badge ${badgeClass}">${recipe.percent}%</div>
                </div>
                <div class="card-content">
                    <h3>${recipe.title}</h3>
                    <div class="card-meta">
                        <span><span class="material-icons-round" style="font-size:14px">schedule</span> ${recipe.time} мин</span>
                        <span><span class="material-icons-round" style="font-size:14px">bar_chart</span> ${recipe.difficulty}</span>
                    </div>
                    <div class="missing-ingredients">${missingText}</div>
                </div>
            `;
            recipesContainer.appendChild(card);
        });
    }

    // --- Listeners for filters ---
    document.getElementById('filter-category').addEventListener('change', updateRecipesList);
    document.getElementById('filter-difficulty').addEventListener('change', updateRecipesList);
    
    document.getElementById('btn-random').addEventListener('click', () => {
        if (allRecipes.length === 0) return;
        const random = allRecipes[Math.floor(Math.random() * allRecipes.length)];
        const matchData = calculateMatch(random);
        openRecipeModal({ ...random, ...matchData });
    });

    // --- Modal Logic ---
    function openRecipeModal(recipe) {
        modal.classList.remove('hidden');
        const isFav = favorites.includes(recipe.id);
        
        // Генерация списка ингредиентов с иконками статуса
        const ingredientsHTML = recipe.ingredients.map(ing => {
            let statusIcon = 'cancel'; // Крестик по умолчанию
            let statusClass = 'status-miss';
            let tooltip = '';
            let btnAddShop = `<button onclick="addToShop('${ing.name}')" class="btn-text" style="font-size:0.7rem;">+ в список</button>`;

            if (selectedIngredients.has(ing.id)) {
                statusIcon = 'check_circle';
                statusClass = 'status-has';
                btnAddShop = '';
            } else if (checkSubstitute(ing.id)) {
                statusIcon = 'autorenew';
                statusClass = 'status-sub';
                tooltip = 'title="Можно заменить доступным продуктом"';
            }

            return `
                <div class="ing-list-item">
                    <div>
                        <span class="material-icons-round status-icon ${statusClass}" ${tooltip}>${statusIcon}</span>
                        ${ing.name} <span style="color:#888">(${ing.amount})</span>
                    </div>
                    ${btnAddShop}
                </div>
            `;
        }).join('');

        const stepsHTML = recipe.steps.map((step, idx) => `
            <div class="step-item">
                <div class="step-num">${idx + 1}</div>
                <div class="step-text">${step}</div>
            </div>
        `).join('');

        modalBody.innerHTML = `
            <img src="${recipe.image}" class="recipe-detail-img" alt="${recipe.title}">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h2>${recipe.title}</h2>
                <button onclick="toggleFavorite('${recipe.id}')" class="icon-btn">
                    <span class="material-icons-round" style="color: ${isFav ? 'var(--primary)' : 'inherit'}">
                        ${isFav ? 'favorite' : 'favorite_border'}
                    </span>
                </button>
            </div>
            
            <h3 style="margin-bottom:10px">Ингредиенты</h3>
            <div style="margin-bottom:20px">${ingredientsHTML}</div>
            
            <h3 style="margin-bottom:10px">Приготовление</h3>
            <div>${stepsHTML}</div>

            <a href="${recipe.source.url}" target="_blank" class="source-link">
                Источник рецепта: ${recipe.source.name}
            </a>
        `;
    }

    // Глобальные функции для inline onclick в HTML (так проще для Vanilla JS)
    window.toggleFavorite = (id) => {
        if (favorites.includes(id)) {
            favorites = favorites.filter(fid => fid !== id);
        } else {
            favorites.push(id);
        }
        localStorage.setItem('ilovecook_favorites', JSON.stringify(favorites));
        // Перерисовываем модалку (грубый метод, но работает)
        const currentRecipe = allRecipes.find(r => r.id === id);
        if(currentRecipe) openRecipeModal(calculateMatch(currentRecipe) ? {...currentRecipe, ...calculateMatch(currentRecipe)} : currentRecipe);
    };

    window.addToShop = (name) => {
        if (!shoppingList.includes(name)) {
            shoppingList.push(name);
            localStorage.setItem('ilovecook_shopping', JSON.stringify(shoppingList));
            alert(`${name} добавлен в список покупок`);
        }
    };

    // --- Modal Closing ---
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => {
            modal.classList.add('hidden');
            shoppingModal.classList.add('hidden');
        };
    });
    
    // Закрытие по клику вне контента
    window.onclick = (e) => {
        if (e.target === modal) modal.classList.add('hidden');
        if (e.target === shoppingModal) shoppingModal.classList.add('hidden');
    };

    // --- Shopping List Logic ---
    document.getElementById('btn-shopping-list').addEventListener('click', () => {
        shoppingModal.classList.remove('hidden');
        renderShoppingList();
    });

    function renderShoppingList() {
        shoppingListItems.innerHTML = '';
        if (shoppingList.length === 0) {
            shoppingListItems.innerHTML = '<li style="padding:10px; color:#888; text-align:center;">Список пуст</li>';
            return;
        }
        shoppingList.forEach((item, idx) => {
            const li = document.createElement('li');
            li.className = 'shop-item';
            li.innerHTML = `
                <span>${item}</span>
                <button onclick="removeFromShop(${idx})"><span class="material-icons-round">delete</span></button>
            `;
            shoppingListItems.appendChild(li);
        });
    }

    window.removeFromShop = (idx) => {
        shoppingList.splice(idx, 1);
        localStorage.setItem('ilovecook_shopping', JSON.stringify(shoppingList));
        renderShoppingList();
    };

    document.getElementById('clear-shopping-list').addEventListener('click', () => {
        shoppingList = [];
        localStorage.setItem('ilovecook_shopping', JSON.stringify(shoppingList));
        renderShoppingList();
    });
    
    // Favorites Button in Header
    document.getElementById('btn-favorites').addEventListener('click', () => {
        // Показать только избранные. Для простоты - фильтруем текущий список.
        // В реальном проекте лучше сделать отдельную вкладку.
        // Здесь мы просто алерт, так как ТЗ ограничено структурой.
        alert('Фильтр по избранному не реализован в UI, но данные сохраняются: ' + favorites.length + ' рецептов.');
    });
});
