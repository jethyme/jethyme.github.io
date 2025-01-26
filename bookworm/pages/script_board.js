const chalkboard = document.querySelector('.chalkboard');
const text = document.getElementById('text');

chalkboard.addEventListener('mousemove', (e) => {
    const rect = chalkboard.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Создаем "стирающий" элемент
    const erase = document.createElement('span');
    erase.style.position = 'absolute';
    erase.style.width = '40px'; // Ширина "стирания"
    erase.style.height = '40px'; // Высота "стирания"
    erase.style.borderRadius = '30%';
    erase.style.backgroundColor = '#333'; // Цвет грифельной доски
    erase.style.pointerEvents = 'none';
    erase.style.left = `${x}px`;
    erase.style.top = `${y}px`;
    erase.style.pointerEvents = 'none';

    chalkboard.appendChild(erase);

    // Стираем текст под "стирающим" элементом
    const textContent = text.textContent;
    const range = document.createRange();
    const selection = window.getSelection();

    // Удаляем часть текста
    if (selection.rangeCount > 0) {
        range.setStart(text.firstChild, 0);
        range.setEnd(text.firstChild, textContent.length);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('insertText', false, '');
    }


});
