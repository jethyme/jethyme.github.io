let currentTextIndex = 0;
const texts = document.querySelectorAll('.text');
let isChanging = false; // Переменная для отслеживания состояния смены текста
let scrollMessageTimeout; // Переменная для хранения таймера

// Функция для показа текста по индексу
function showText(index) {
    // Скрываем текущий текст
    texts[currentTextIndex].classList.remove('visible');
    texts[currentTextIndex].classList.add('hidden');
    currentTextIndex = index; // Обновляем индекс
    // Показываем следующий текст
    texts[currentTextIndex].classList.remove('hidden');
    texts[currentTextIndex].classList.add('visible');
}

// Функция для показа сообщения "Листай дальше"
function showScrollMessage() {
    document.getElementById('scrollMessage').classList.add('visible');
}

// Сбросить таймер
function resetScrollMessageTimeout() {
    clearTimeout(scrollMessageTimeout); // Очищаем предыдущий таймер
    scrollMessageTimeout = setTimeout(showScrollMessage, 7000); // Устанавливаем новый таймер
}

// Обработчик события прокрутки
window.addEventListener('wheel', (event) => {
    resetScrollMessageTimeout(); // Сброс таймера при прокрутке

    if (!isChanging) { // Проверяем, можно ли менять текст
        isChanging = true; // Устанавливаем флаг, чтобы предотвратить повторные вызовы

        if (event.deltaY > 0) { // Прокрутка вниз
            if (currentTextIndex < texts.length - 1) {
                showText(currentTextIndex + 1);
            } else {
                // Переход на другую страницу после завершения
                setTimeout(() => {
                    window.location.href = 'part1.html'; // Замените на нужный URL
                }, 1000); // Задержка перед переходом
            }
        } else { // Прокрутка вверх
            if (currentTextIndex > 0) {
                showText(currentTextIndex - 1);
            }
        }

        // Задержка перед следующей сменой текста
        setTimeout(() => {
            isChanging = false; // Сбрасываем флаг после задержки
        }, 1000); // Задержка в 1 секунду
    }
});
// Обработчик события клика
window.addEventListener('click', () => {
    resetScrollMessageTimeout(); // Сброс таймера при клике

    if (!isChanging) { // Проверяем, можно ли менять текст
        isChanging = true; // Устанавливаем флаг, чтобы предотвратить повторные вызовы

        // Переход на следующий текст при клике
        if (currentTextIndex < texts.length - 1) {
            showText(currentTextIndex + 1);
        } else {
            // Переход на другую страницу после завершения
            setTimeout(() => {
                window.location.href = 'part1.html'; // Замените на нужный URL
            }, 1000); // Задержка перед переходом
        }

        // Задержка перед следующей сменой текста
        setTimeout(() => {
            isChanging = false; // Сбрасываем флаг после задержки
        }, 1000); // Задержка в 1 секунду
    }
});

// Инициализация
texts[currentTextIndex].classList.remove('hidden'); // Показываем первый текст
texts[currentTextIndex].classList.add('visible'); // Делаем его видимым

// Устанавливаем таймер для показа сообщения при загрузке
resetScrollMessageTimeout();
