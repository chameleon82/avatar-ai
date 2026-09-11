import {Avatar} from './avatar/avatar.js';
import {createOutputTracker} from './avatar/visemes.js';
import {RealtimeClient} from './openai/realtimeClient.js';
import {PCM16Audio} from './audio/pcm16Audio.js';

const AVATARS = {
    'avatar-w': {model: './src/assets/avatar-w.glb', voice: 'sage', name: 'Milena', sex: 'female'},
    avatar: {model: './src/assets/avatar.glb', voice: 'alloy', name: 'Alex', sex: 'male'},
    'avatar-m': {model: './src/assets/avatar-m.glb', voice: 'echo', name: 'Marcus', sex: 'male'},
};
const MENU = [
    {id: 'espresso', name: 'Espresso', description: 'Bold, short and silky', price: 3.20, calories: 5, icon: '☕'},
    {id: 'double-espresso', name: 'Double espresso', description: 'Twice the rich coffee intensity', price: 4.10, calories: 10, icon: '☕'},
    {id: 'americano', name: 'Americano', description: 'Espresso softened with hot water', price: 3.60, calories: 10, icon: '☕'},
    {id: 'cortado', name: 'Cortado', description: 'Balanced espresso and warm milk', price: 4.30, calories: 70, icon: '◐'},
    {id: 'macchiato', name: 'Macchiato', description: 'Espresso kissed with foam', price: 4.20, calories: 35, icon: '☕'},
    {id: 'cappuccino', name: 'Cappuccino', description: 'Velvety milk and cocoa', price: 4.80, calories: 120, icon: '◒'},
    {id: 'flat-white', name: 'Flat white', description: 'Silky microfoam and espresso', price: 5.10, calories: 140, icon: '🥛'},
    {id: 'latte', name: 'Vanilla latte', description: 'Sweet vanilla, soft foam', price: 5.40, calories: 210, icon: '🥛'},
    {id: 'caramel-latte', name: 'Caramel latte', description: 'Espresso, caramel and steamed milk', price: 5.80, calories: 260, icon: '🥛'},
    {id: 'mocha', name: 'Mocha', description: 'Chocolate, espresso and milk', price: 5.90, calories: 290, icon: '🍫'},
    {id: 'white-mocha', name: 'White mocha', description: 'Creamy white chocolate espresso', price: 6.10, calories: 320, icon: '🍫'},
    {id: 'chai-latte', name: 'Chai latte', description: 'Spiced tea with creamy milk', price: 5.20, calories: 190, icon: '🫖'},
    {id: 'hot-chocolate', name: 'Hot chocolate', description: 'Rich cocoa with soft cream', price: 4.90, calories: 240, icon: '🍫'},
    {id: 'matcha', name: 'Iced matcha', description: 'Earthy ceremonial green tea', price: 5.20, calories: 120, icon: '🍵'},
    {id: 'matcha-latte', name: 'Matcha latte', description: 'Ceremonial matcha with oat milk', price: 5.80, calories: 180, icon: '🍵'},
    {id: 'iced-americano', name: 'Iced americano', description: 'Chilled espresso over ice', price: 4.00, calories: 15, icon: '🧊'},
    {id: 'cold-brew', name: 'Cold brew', description: 'Slow-steeped and bright', price: 4.60, calories: 20, icon: '🧊'},
    {id: 'nitro-cold-brew', name: 'Nitro cold brew', description: 'Silky, nitrogen-infused cold brew', price: 5.40, calories: 25, icon: '🧊'},
    {id: 'iced-latte', name: 'Iced latte', description: 'Chilled espresso and milk', price: 5.20, calories: 150, icon: '🥤'},
    {id: 'iced-mocha', name: 'Iced mocha', description: 'Chocolate coffee over ice', price: 5.90, calories: 280, icon: '🥤'},
    {id: 'affogato', name: 'Affogato', description: 'Vanilla gelato drowned in espresso', price: 6.20, calories: 230, icon: '🍨'},
    {id: 'coffee-frappe', name: 'Coffee frappé', description: 'Blended coffee with cool foam', price: 6.00, calories: 310, icon: '🥤'},
    {id: 'berry-smoothie', name: 'Berry smoothie', description: 'Bright berries and yogurt', price: 6.40, calories: 220, icon: '🍓'},
    {id: 'green-smoothie', name: 'Green smoothie', description: 'Apple, spinach and lime', price: 6.50, calories: 180, icon: '🥬'},
    {id: 'croissant', name: 'Butter croissant', description: 'Warm, flaky and golden', price: 3.90, calories: 260, icon: '🥐'},
    {id: 'almond-croissant', name: 'Almond croissant', description: 'Flaky pastry with almond cream', price: 4.80, calories: 410, icon: '🥐'},
    {id: 'chocolate-croissant', name: 'Chocolate croissant', description: 'Buttery pastry with dark chocolate', price: 4.50, calories: 330, icon: '🥐'},
    {id: 'blueberry-muffin', name: 'Blueberry muffin', description: 'Soft crumb with fresh berries', price: 4.20, calories: 380, icon: '🧁'},
    {id: 'banana-bread', name: 'Banana bread', description: 'Moist loaf with toasted walnuts', price: 4.30, calories: 340, icon: '🍌'},
    {id: 'cinnamon-roll', name: 'Cinnamon roll', description: 'Warm swirl with vanilla glaze', price: 4.90, calories: 450, icon: '🍥'},
    {id: 'lemon-cake', name: 'Lemon cake', description: 'Tender cake with lemon zest', price: 4.60, calories: 360, icon: '🍋'},
    {id: 'carrot-cake', name: 'Carrot cake', description: 'Spiced cake with cream cheese icing', price: 5.10, calories: 430, icon: '🥕'},
    {id: 'cheesecake', name: 'Cheesecake slice', description: 'Classic creamy baked cheesecake', price: 5.80, calories: 510, icon: '🍰'},
    {id: 'granola-yogurt', name: 'Granola yogurt', description: 'Greek yogurt, fruit and granola', price: 5.60, calories: 290, icon: '🥣'},
    {id: 'avocado-toast', name: 'Avocado toast', description: 'Sourdough with lemon and chili', price: 7.20, calories: 360, icon: '🥑'},
    {id: 'hummus-toast', name: 'Hummus toast', description: 'Sourdough, hummus and herbs', price: 6.80, calories: 330, icon: '🍞'},
    {id: 'turkey-sandwich', name: 'Turkey sandwich', description: 'Turkey, greens and mustard', price: 8.50, calories: 420, icon: '🥪'},
    {id: 'caprese-panini', name: 'Caprese panini', description: 'Mozzarella, tomato and basil', price: 8.20, calories: 460, icon: '🥪'},
    {id: 'breakfast-wrap', name: 'Breakfast wrap', description: 'Egg, cheese and roasted vegetables', price: 8.90, calories: 520, icon: '🌯'},
    {id: 'oatmeal', name: 'Warm oatmeal', description: 'Oats, berries and maple', price: 5.90, calories: 310, icon: '🥣'},
];
const LANGUAGES = {en: {label: 'English', speech: 'English', ui: {menu: "Today's menu", choose: 'Choose your comfort', note: 'Calories are estimates per serving.', open: 'OPEN', order: 'Your order', empty: 'Your basket is waiting for its first treat.', items: 'items', item: 'item', total: 'Total', calories: 'Estimated calories', pay: 'Ask to pay', next: 'Start next customer', placeholder: "Tell me what you'd like…", unavailable: "That item is not on today's menu."}}, ru: {label: 'Русский', speech: 'Russian', ui: {menu: 'МЕНЮ НА СЕГОДНЯ', choose: 'Выберите любимый напиток', note: 'Калорийность указана приблизительно на порцию.', open: 'ОТКРЫТО', order: 'Ваш заказ', empty: 'Корзина пока пуста.', items: 'товаров', item: 'товар', total: 'Итого', calories: 'Примерная калорийность', pay: 'Перейти к оплате', next: 'Следующий клиент', placeholder: 'Расскажите, что вы хотите…', unavailable: 'Этого товара сегодня нет в меню.'}}, zh: {label: '中文', speech: 'Chinese', ui: {menu: '今日菜单', choose: '选择您喜欢的饮品', note: '热量为每份估算值。', open: '营业中', order: '您的订单', empty: '购物篮还是空的。', items: '件商品', item: '件商品', total: '合计', calories: '预计热量', pay: '请求付款', next: '下一位顾客', placeholder: '请告诉我您想要什么…', unavailable: '这款商品今天不在菜单上。'}}, th: {label: 'ไทย', speech: 'Thai', ui: {menu: 'เมนูวันนี้', choose: 'เลือกเครื่องดื่มที่คุณชอบ', note: 'แคลอรี่เป็นค่าประมาณต่อหนึ่งหน่วยบริโภค', open: 'เปิดให้บริการ', order: 'รายการสั่งซื้อของคุณ', empty: 'ตะกร้าของคุณยังว่างอยู่', items: 'รายการ', item: 'รายการ', total: 'รวม', calories: 'แคลอรี่โดยประมาณ', pay: 'ขอชำระเงิน', next: 'ลูกค้าคนถัดไป', placeholder: 'บอกเราได้เลยว่าต้องการอะไร…', unavailable: 'รายการนี้ไม่มีในเมนูวันนี้'}}};
const MENU_TRANSLATIONS = {
 espresso: {ru:['Эспрессо','Крепкий, короткий и шелковистый'],zh:['浓缩咖啡','浓郁、短小而顺滑'],th:['เอสเปรสโซ','เข้มข้น หอมละมุน และเสิร์ฟแก้วเล็ก']}, 'double-espresso': {ru:['Двойной эспрессо','Вдвое больше насыщенного кофейного вкуса'],zh:['双份浓缩咖啡','双倍浓郁咖啡风味'],th:['ดับเบิลเอสเปรสโซ','รสชาติกาแฟเข้มข้นเป็นสองเท่า']}, americano:{ru:['Американо','Эспрессо с горячей водой'],zh:['美式咖啡','浓缩咖啡加热水'],th:['อเมริกาโน','เอสเปรสโซเติมน้ำร้อน']}, cortado:{ru:['Кор cortado','Баланс эспрессо и тёплого молока'],zh:['科尔塔多','浓缩咖啡与温牛奶的平衡'],th:['คอร์ตาโด','เอสเปรสโซกับนมอุ่นอย่างลงตัว']}, macchiato:{ru:['Макиато','Эспрессо с лёгкой пенкой'],zh:['玛奇朵','带有奶泡的浓缩咖啡'],th:['มัคคิอาโต','เอสเปรสโซแตะโฟมนมนุ่ม']}, cappuccino:{ru:['Капучино','Бархатистое молоко и какао'],zh:['卡布奇诺','丝滑牛奶与可可'],th:['คาปูชิโน','นมนุ่มละมุนกับโกโก้']}, 'flat-white':{ru:['Флэт уайт','Шелковистая микропена и эспрессо'],zh:['馥芮白','丝滑奶泡与浓缩咖啡'],th:['แฟลตไวท์','ไมโครโฟมนุ่มกับเอสเปรสโซ']}, latte:{ru:['Ванильный латте','Сладкая ваниль и нежная пенка'],zh:['香草拿铁','甜香草与柔软奶泡'],th:['วานิลลาลาเต้','วานิลลาหวานกับโฟมนุ่ม']}, 'caramel-latte':{ru:['Карамельный латте','Эспрессо, карамель и паровое молоко'],zh:['焦糖拿铁','浓缩咖啡、焦糖与蒸奶'],th:['คาราเมลลาเต้','เอสเปรสโซ คาราเมล และนมนึ่ง']}, mocha:{ru:['Мокка','Шоколад, эспрессо и молоко'],zh:['摩卡','巧克力、浓缩咖啡与牛奶'],th:['มอคค่า','ช็อกโกแลต เอสเปรสโซ และนม']}, 'white-mocha':{ru:['Белый мокка','Сливочный белый шоколад и эспрессо'],zh:['白摩卡','奶油白巧克力浓缩咖啡'],th:['ไวท์มอคค่า','ไวท์ช็อกโกแลตครีมกับเอสเปรสโซ']}, 'chai-latte':{ru:['Чайный латте','Пряный чай с молоком'],zh:['印度奶茶拿铁','香料茶配奶油牛奶'],th:['ไชลาเต้','ชารสเครื่องเทศกับนมครีม']}, 'hot-chocolate':{ru:['Горячий шоколад','Насыщенное какао с нежными сливками'],zh:['热巧克力','浓郁可可配柔滑奶油'],th:['ช็อกโกแลตร้อน','โกโก้เข้มข้นกับครีมนุ่ม']}, matcha:{ru:['Матча со льдом','Землистый церемониальный зелёный чай'],zh:['冰抹茶','醇厚的仪式感绿茶'],th:['มัทฉะเย็น','ชาเขียวมัทฉะกลิ่นหอมละมุน']}, 'matcha-latte':{ru:['Матча латте','Церемониальная матча с овсяным молоком'],zh:['抹茶拿铁','仪式感抹茶配燕麦奶'],th:['มัทฉะลาเต้','มัทฉะพรีเมียมกับนมข้าวโอ๊ต']}, 'iced-americano':{ru:['Айс американо','Охлаждённый эспрессо со льдом'],zh:['冰美式','冰镇浓缩咖啡'],th:['ไอซ์อเมริกาโน','เอสเปรสโซเย็นใส่น้ำแข็ง']}, 'cold-brew':{ru:['Колд брю','Медленно заваренный, яркий и лёгкий'],zh:['冷萃咖啡','慢萃取、清爽明亮'],th:['โคลด์บริว','สกัดเย็น รสสดชื่น']}, 'nitro-cold-brew':{ru:['Нитро колд брю','Шелковистый колд брю с азотом'],zh:['氮气冷萃','丝滑的氮气冷萃咖啡'],th:['ไนโตรโคลด์บริว','โคลด์บริวเนื้อเนียนผสานไนโตรเจน']}, 'iced-latte':{ru:['Айс латте','Охлаждённый эспрессо с молоком'],zh:['冰拿铁','冰镇浓缩咖啡加牛奶'],th:['ไอซ์ลาเต้','เอสเปรสโซเย็นกับนม']}, 'iced-mocha':{ru:['Айс мокка','Шоколадный кофе со льдом'],zh:['冰摩卡','冰镇巧克力咖啡'],th:['ไอซ์มอคค่า','กาแฟช็อกโกแลตใส่น้ำแข็ง']}, affogato:{ru:['Аффогато','Ванильное мороженое с эспрессо'],zh:['阿芙佳朵','香草冰淇淋浇浓缩咖啡'],th:['อัฟโฟกาโต','เจลาโตวานิลลาราดเอสเปรสโซ']}, 'coffee-frappe':{ru:['Кофейный фраппе','Взбитый кофе с холодной пенкой'],zh:['咖啡星冰乐','冰凉奶泡搅打咖啡'],th:['กาแฟแฟรปเป้','กาแฟปั่นกับโฟมเย็น']}, 'berry-smoothie':{ru:['Ягодный смузи','Яркие ягоды и йогурт'],zh:['莓果奶昔','莓果与酸奶'],th:['เบอร์รี่สมูทตี้','เบอร์รี่สดกับโยเกิร์ต']}, 'green-smoothie':{ru:['Зелёный смузи','Яблоко, шпинат и лайм'],zh:['绿色奶昔','苹果、菠菜与青柠'],th:['กรีนสมูทตี้','แอปเปิล ผักโขม และมะนาว']}, croissant:{ru:['Сливочный круассан','Тёплый, слоёный и золотистый'],zh:['黄油可颂','温热、酥脆、金黄'],th:['ครัวซองต์เนย','อุ่น กรอบ และสีทอง']}, 'almond-croissant':{ru:['Миндальный круассан','Слоёная выпечка с миндальным кремом'],zh:['杏仁可颂','酥皮配杏仁奶油'],th:['ครัวซองต์อัลมอนด์','ขนมอบกับครีมอัลมอนด์']}, 'chocolate-croissant':{ru:['Шоколадный круассан','Слоёная выпечка с тёмным шоколадом'],zh:['巧克力可颂','黄油酥皮配黑巧克力'],th:['ครัวซองต์ช็อกโกแลต','ขนมเนยกับดาร์กช็อกโกแลต']}, 'blueberry-muffin':{ru:['Черничный маффин','Мягкий мякиш со свежими ягодами'],zh:['蓝莓玛芬','松软蛋糕与新鲜蓝莓'],th:['มัฟฟินบลูเบอร์รี่','เนื้อนุ่มกับเบอร์รี่สด']}, 'banana-bread':{ru:['Банановый хлеб','Влажный кекс с жареными грецкими орехами'],zh:['香蕉面包','湿润蛋糕配烤核桃'],th:['ขนมปังกล้วย','เนื้อนุ่มกับวอลนัทอบ']}, 'cinnamon-roll':{ru:['Булочка с корицей','Тёплая спираль с ванильной глазурью'],zh:['肉桂卷','温热肉桂卷配香草糖霜'],th:['ซินนามอนโรล','โรลอุ่นกับไอซิ่งวานิลลา']}, 'lemon-cake':{ru:['Лимонный кекс','Нежный кекс с цедрой лимона'],zh:['柠檬蛋糕','细腻蛋糕配柠檬皮'],th:['เค้กเลมอน','เค้กนุ่มหอมผิวเลมอน']}, 'carrot-cake':{ru:['Морковный торт','Пряный торт со сливочным кремом'],zh:['胡萝卜蛋糕','香料蛋糕配奶油奶酪糖霜'],th:['เค้กแครอท','เค้กเครื่องเทศกับครีมชีส']}, cheesecake:{ru:['Чизкейк','Классический нежный запечённый чизкейк'],zh:['芝士蛋糕','经典奶油烘焙芝士蛋糕'],th:['ชีสเค้ก','ชีสเค้กอบเนื้อครีมแบบคลาสสิก']}, 'granola-yogurt':{ru:['Йогурт с гранолой','Греческий йогурт, фрукты и гранола'],zh:['格兰诺拉酸奶','希腊酸奶、水果与格兰诺拉'],th:['โยเกิร์ตกราโนลา','โยเกิร์ตกรีก ผลไม้ และกราโนลา']}, 'avocado-toast':{ru:['Тост с авокадо','Хлеб на закваске с лимоном и чили'],zh:['牛油果吐司','酸面包配柠檬和辣椒'],th:['โทสต์อะโวคาโด','ซาวร์โดว์กับเลมอนและพริก']}, 'hummus-toast':{ru:['Тост с хумусом','Хлеб на закваске, хумус и травы'],zh:['鹰嘴豆泥吐司','酸面包、鹰嘴豆泥与香草'],th:['โทสต์ฮัมมุส','ซาวร์โดว์ ฮัมมุส และสมุนไพร']}, 'turkey-sandwich':{ru:['Сэндвич с индейкой','Индейка, зелень и горчица'],zh:['火鸡三明治','火鸡肉、生菜与芥末'],th:['แซนด์วิชไก่งวง','ไก่งวง ผักใบเขียว และมัสตาร์ด']}, 'caprese-panini':{ru:['Панини капрезе','Моцарелла, помидор и базилик'],zh:['卡普雷塞帕尼尼','马苏里拉、番茄与罗勒'],th:['คาเปรเซพานินี','มอสซาเรลลา มะเขือเทศ และโหระพา']}, 'breakfast-wrap':{ru:['Завтраточный ролл','Яйцо, сыр и запечённые овощи'],zh:['早餐卷','鸡蛋、奶酪与烤蔬菜'],th:['แรปอาหารเช้า','ไข่ ชีส และผักย่าง']}, oatmeal:{ru:['Тёплая овсянка','Овсянка, ягоды и кленовый сироп'],zh:['温热燕麦粥','燕麦、莓果与枫糖'],th:['ข้าวโอ๊ตร้อน','ข้าวโอ๊ต เบอร์รี่ และเมเปิล']}
};
let language = localStorage.getItem('coffeeLanguage') || ((navigator.language || 'en').toLowerCase().startsWith('ru') ? 'ru' : (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : (navigator.language || '').toLowerCase().startsWith('th') ? 'th' : 'en');
function localized(item, field) { return language === 'en' ? item[field] : (MENU_TRANSLATIONS[item.id]?.[language]?.[field === 'name' ? 0 : 1] || item[field]); }
function displayName(item) { return localized(item, 'name'); }
function displayDescription(item) { return localized(item, 'description'); }
function currentLanguage() { return LANGUAGES[language] || LANGUAGES.en; }
function setLanguage(next) { if (!LANGUAGES[next]) return false; language = next; localStorage.setItem('coffeeLanguage', language); const selector = document.getElementById('coffeeLanguage'); if (selector) selector.value = language; renderMenu(); renderBasket(); renderLanguageUI(); realtime?.updateInstructions(instructions()); return true; }
function renderLanguageUI() { const l = currentLanguage().ui; for (const [id, text] of [['menuEyebrow', l.menu], ['menuTitle', l.choose], ['menuNote', l.note], ['openTag', l.open], ['basketTitle', l.order], ['basketTotalLabel', l.total], ['basketCaloriesLabel', l.calories], ['payButton', l.pay], ['nextCustomerButton', l.next]]) { const el = document.getElementById(id); if (el) el.textContent = text; } const selector = document.getElementById('coffeeLanguage'); if (selector) selector.value = language; const input = document.getElementById('coffeeText'); if (input) input.placeholder = l.placeholder; }
const SETTINGS_KEY = 'openaiSettings';
const defaults = {baseUrl: 'https://api.openai.com', model: 'gpt-realtime-mini', avatar: 'avatar-w', apiKey: '', rememberKey: false};
let settings = loadSettings();
let apiKey = settings.rememberKey ? settings.apiKey : '';
let avatar = null;
let realtime = null;
let recorder = null;
let outputVisemeTracker = null;
let micOn = false;
let order = [];
let pendingPaymentCallId = null;
let paymentReference = '';
let paid = false;

function loadSettings() {
    try { return {...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')}; }
    catch (_) { return {...defaults}; }
}
function option() { return AVATARS[settings.avatar] || AVATARS['avatar-w']; }
function money(value) { return `$${value.toFixed(2)}`; }
function menuItem(id) { return MENU.find((item) => item.id === id); }
function orderTotal() { return order.reduce((total, line) => total + line.quantity * line.item.price, 0); }
function orderCalories() { return order.reduce((total, line) => total + line.quantity * line.item.calories, 0); }
function orderCount() { return order.reduce((total, line) => total + line.quantity, 0); }
function orderSummary() { return order.map((line) => `${line.quantity}× ${displayName(line.item)}`).join(', ') || currentLanguage().ui.empty; }
function highlightMenuItem(id) {
    const item = menuItem(id);
    const element = document.querySelector(`[data-menu-id="${CSS.escape(String(id))}"]`);
    if (!item || !element) return {error: `Unknown menu item: ${id}`};
    document.querySelectorAll('.menu-item.recommended').forEach((button) => button.classList.remove('recommended'));
    element.classList.add('recommended');
    element.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'nearest'});
    window.setTimeout(() => element.classList.remove('recommended'), 6000);
    console.info('[coffee menu] barista recommended', displayName(item));
    return {status: 'menu item highlighted', item: displayName(item), itemId: item.id};
}

function renderMenu() {
    document.getElementById('menuGrid').innerHTML = MENU.map((item) => `
        <button class="menu-item" data-menu-id="${item.id}">
            <span class="menu-icon">${item.icon}</span><h3>${displayName(item)}</h3>
            <p>${displayDescription(item)}</p><span class="menu-meta"><span class="menu-calories">${item.calories} kcal</span><span class="menu-price">${money(item.price)}</span></span>
        </button>`).join('');
    document.querySelectorAll('[data-menu-id]').forEach((button) => button.addEventListener('click', () => {
        addToOrder(button.dataset.menuId, 1);
        sendUserText(`The customer selected menu item id ${button.dataset.menuId} (${displayName(menuItem(button.dataset.menuId))}) using the menu button. It is already in the basket; confirm it without adding it again.`);
    }));
}
function renderBasket() {
    const lines = document.getElementById('basketLines');
    const ui = currentLanguage().ui;
    document.getElementById('basketCount').textContent = `${orderCount()} ${orderCount() === 1 ? ui.item : ui.items}`;
    document.getElementById('basketTotal').textContent = money(orderTotal());
    document.getElementById('basketCalories').textContent = `${orderCalories()} kcal`;
    document.getElementById('payButton').disabled = order.length === 0 || paid;
    document.getElementById('nextCustomerButton').hidden = !paid;
    lines.innerHTML = order.length ? order.map((line) => `<div class="basket-line"><span>${displayName(line.item)}<small> × ${line.quantity} · ${line.item.calories * line.quantity} kcal</small></span><strong>${money(line.item.price * line.quantity)}</strong><button class="remove-line" data-remove-id="${line.item.id}" aria-label="Remove ${displayName(line.item)}">×</button></div>`).join('') : `<p class="empty-basket">${ui.empty}</p>`;
    lines.querySelectorAll('[data-remove-id]').forEach((button) => button.addEventListener('click', () => {
        removeFromOrder(button.dataset.removeId, 1);
        sendUserText(`Remove one menu item with id ${button.dataset.removeId} (${displayName(menuItem(button.dataset.removeId))}) from my order.`);
    }));
}
function addToOrder(id, quantity = 1) {
    paid = false;
    const item = menuItem(id);
    const amount = Math.max(1, Math.min(9, Number(quantity) || 1));
    if (!item) return {error: `Unknown menu item: ${id}`};
    const line = order.find((entry) => entry.item.id === id);
    if (line) line.quantity = Math.min(9, line.quantity + amount);
    else order.push({item, quantity: amount});
    renderBasket();
    return {item: item.name, quantity: amount, calories: item.calories * amount, order: orderSummary(), total: money(orderTotal()), totalCalories: `${orderCalories()} kcal`};
}
function removeFromOrder(id, quantity = 1) {
    const line = order.find((entry) => entry.item.id === id);
    if (!line) return {order: orderSummary(), total: money(orderTotal())};
    line.quantity -= Math.max(1, Number(quantity) || 1);
    if (line.quantity <= 0) order = order.filter((entry) => entry !== line);
    renderBasket();
    return {order: orderSummary(), total: money(orderTotal()), totalCalories: `${orderCalories()} kcal`};
}
function clearOrder() { order = []; renderBasket(); }

function qrMarkup(seed) {
    let hash = 2166136261;
    for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const cells = [];
    const finder = (x, y) => x < 7 && y < 7 || x >= 14 && y < 7 || x < 7 && y >= 14;
    for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
        const inFinder = finder(x, y);
        const border = (x % 14 < 7 && y % 14 < 7) && (x % 14 === 0 || y % 14 === 0 || x % 14 === 6 || y % 14 === 6);
        const center = (x % 14 >= 2 && x % 14 <= 4 && y % 14 >= 2 && y % 14 <= 4);
        hash = Math.imul(hash ^ (x * 31 + y * 17), 16777619);
        cells.push(`<i class="qr-cell ${inFinder ? (border || center ? '' : 'off') : ((hash >>> 3) & 1 ? '' : 'off')}"></i>`);
    }
    return cells.join('');
}
function showPayment(callId = null) {
    if (!order.length) return {error: 'There is no order to pay for.'};
    pendingPaymentCallId = callId;
    paymentReference = `BEAN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    document.getElementById('paymentAmount').textContent = money(orderTotal());
    document.getElementById('paymentReference').textContent = paymentReference;
    document.getElementById('qrCode').innerHTML = qrMarkup(paymentReference);
    document.getElementById('paymentPanel').hidden = false;
    return {status: 'payment screen shown', reference: paymentReference, total: money(orderTotal())};
}
function closePayment() { document.getElementById('paymentPanel').hidden = true; }

const BASE_INSTRUCTIONS = `You are the friendly barista ${option().name}. This is a coffee shop ordering experience. Speak warmly and briefly, like a real barista. The customer's current language is ${currentLanguage().speech}; detect the customer's language from their speech or text and call set_language when it changes. Always speak and describe the menu in the selected customer language. The menu UI changes to match that language. The ONLY products available are the exact items listed below: ${MENU.map((item) => `${item.id} (${item.name}; Russian: ${MENU_TRANSLATIONS[item.id]?.ru?.[0]}; Chinese: ${MENU_TRANSLATIONS[item.id]?.zh?.[0]}; Thai: ${MENU_TRANSLATIONS[item.id]?.th?.[0]}) ${money(item.price)}, ${item.calories} kcal`).join('; ')}. Treat this list as the complete and authoritative inventory. You may recommend, describe, compare, or add ONLY items in this list. Never mention, suggest, recommend, promise, substitute, or invent any product that is not listed. If the customer asks for an unavailable item, clearly say it is not on today's menu and offer one or two similar alternatives selected only from the listed menu. Before every recommendation, verify the exact item id appears in the menu above, then call recommend_menu_item. When the customer orders, call add_to_order immediately using the stable item id. Use remove_from_order or clear_order when asked. Keep the customer informed of the running total and estimated calories. When the customer confirms they are finished, call request_payment; never claim real payment. After payment success, thank the customer, give a short pickup estimate, and wait. Use set_avatar_motion for natural gestures. Never invent menu items, calories, or prices.`;
function instructions() { return `${BASE_INSTRUCTIONS}\nCurrent language is ${currentLanguage().speech}. This is authoritative: reply only in ${currentLanguage().speech}, including the very next response. The menu labels and basket are displayed in this language. You are ${option().name}, a ${option().sex} character. Current basket: ${orderSummary()}; total ${money(orderTotal())}.`; }
function languageResponseInstructions() { return `The customer language has just been set to ${currentLanguage().speech}. Reply only in ${currentLanguage().speech} from this response onward. Do not use English or another language unless the customer explicitly asks for translation. Keep the answer brief and continue the coffee-shop conversation.`; }

const coffeeTools = [
    {type: 'function', name: 'add_to_order', description: 'Add one or more exact menu items to the customer basket. Call this when the customer orders something.', parameters: {type: 'object', properties: {itemId: {type: 'string', enum: MENU.map((item) => item.id)}, quantity: {type: 'integer', minimum: 1, maximum: 9}}, required: ['itemId', 'quantity'], additionalProperties: false}},
    {type: 'function', name: 'remove_from_order', description: 'Remove items from the basket when the customer changes their mind.', parameters: {type: 'object', properties: {itemId: {type: 'string', enum: MENU.map((item) => item.id)}, quantity: {type: 'integer', minimum: 1, maximum: 9}}, required: ['itemId', 'quantity'], additionalProperties: false}},
    {type: 'function', name: 'clear_order', description: 'Empty the whole basket when the customer asks to start over.', parameters: {type: 'object', properties: {}, additionalProperties: false}},
    {type: 'function', name: 'recommend_menu_item', description: 'Highlight an exact available menu item while recommending it. Call once per recommended item before explaining it.', parameters: {type: 'object', properties: {itemId: {type: 'string', enum: MENU.map((item) => item.id)}}, required: ['itemId'], additionalProperties: false}},
    {type: 'function', name: 'set_language', description: 'Change the menu and barista language to match the customer. Detect language from the latest customer message or speech.', parameters: {type: 'object', properties: {language: {type: 'string', enum: ['en', 'ru', 'zh', 'th']}}, required: ['language'], additionalProperties: false}},
    {type: 'function', name: 'request_payment', description: 'Show the simulated QR payment screen after the customer confirms the basket.', parameters: {type: 'object', properties: {}, additionalProperties: false}},
];

function resizeAvatar() {
    if (!avatar) return;
    const mount = document.getElementById('avatarMount');
    const rect = mount.getBoundingClientRect();
    avatar.renderer.setSize(rect.width, rect.height, false);
    avatar.camera.aspect = rect.width / Math.max(1, rect.height);
    avatar.camera.updateProjectionMatrix();
}
function createAvatar() {
    if (avatar?.dispose) avatar.dispose();
    avatar = new Avatar(option().model, {debug: false});
    document.getElementById('avatarMount').appendChild(avatar.renderer.domElement);
    resizeAvatar();
    document.getElementById('baristaName').textContent = `${option().name} is ready to help`;
}
function parseArguments(raw) {
    try { return JSON.parse(String(raw || '{}').replace(/^```json\s*/i, '').replace(/\s*```$/, '')); }
    catch (_) { return {}; }
}
function sendUserText(text, {replaceActiveResponse = true} = {}) {
    const value = String(text || '').trim();
    if (!value || !realtime?.isOpen) return;
    if (replaceActiveResponse) {
        realtime.cancelResponse({clearPending: true});
        recorder?.stopPlayback();
        console.debug('[coffee realtime] replaced pending barista response with latest customer state');
    }
    realtime.sendText(value);
}
function setStatus(connected) {
    const status = document.getElementById('baristaStatus');
    status.textContent = connected ? 'Connected' : 'Offline';
    status.classList.toggle('connected', connected);
}
function handleFunctionCall(message) {
    if (message.type !== 'response.function_call_arguments.done') return false;
    const args = parseArguments(message.arguments);
    let result;
    if (message.name === 'add_to_order') result = addToOrder(args.itemId, args.quantity);
    else if (message.name === 'remove_from_order') result = removeFromOrder(args.itemId, args.quantity);
    else if (message.name === 'clear_order') { clearOrder(); result = {status: 'basket cleared', total: '$0.00'}; }
    else if (message.name === 'recommend_menu_item') result = highlightMenuItem(args.itemId);
    else if (message.name === 'set_language') { const changed = setLanguage(args.language); result = {status: changed ? 'language changed' : 'language unchanged', language: language, languageName: currentLanguage().label}; }
    else if (message.name === 'request_payment') result = showPayment(message.call_id);
    else return false;
    realtime.sendFunctionOutput(message.call_id, result || {status: 'done'}, message.name === 'set_language' ? {instructions: languageResponseInstructions()} : {});
    return true;
}
function handlePayment(success) {
    const reference = paymentReference;
    closePayment();
    if (success) { paid = true; renderBasket(); }
    const message = success ? `Payment ${reference} succeeded. The customer has paid for ${orderSummary()}. Thank them, give a short pickup estimate, and wait for the next customer.` : `Payment ${reference} failed. Tell the customer briefly and offer to try the simulated payment again.`;
    if (pendingPaymentCallId && realtime?.isOpen) realtime.sendFunctionOutput(pendingPaymentCallId, {payment: success ? 'succeeded' : 'failed', reference});
    pendingPaymentCallId = null;
    sendUserText(message);
}
function resetForNextCustomer() {
    clearOrder();
    paid = false;
    closePayment();
    pendingPaymentCallId = null;
    sendUserText('A new customer has arrived. Greet them and ask what they would like to drink.');
}

function startRealtime() {
    if (!apiKey) { document.getElementById('coffeeSettingsPanel').hidden = false; return; }
    realtime?.close();
    realtime = new RealtimeClient({baseUrl: settings.baseUrl, model: settings.model, apiKey, voice: option().voice, buildInstructions: instructions, tools: coffeeTools, debug: true,
        onOpen: () => { setStatus(true); avatar.setSleep(false); sendUserText('A new customer has arrived. Greet them warmly and ask what they would like to order.'); },
        onClose: () => { setStatus(false); avatar.setSleep(true); },
        onError: (error) => console.error('[coffee realtime] websocket error', error),
        onMessage: (message) => {
            if (message.type === 'error') { console.error('[coffee realtime] server error', message.error || message); return; }
            if (handleFunctionCall(message)) return;
            if (message.type === 'response.output_audio.delta' || message.type === 'response.audio.delta') {
                try { recorder.addPlayChunk(PCM16Audio.bytesToPcm(atob(message.delta))); } catch (error) { console.error('[coffee audio]', error); }
            }
            if (message.type === 'response.output_audio_transcript.done' && message.transcript) console.debug('[coffee barista]', message.transcript);
            if (message.type === 'input_audio_buffer.speech_started') avatar.setListening(true);
            if (message.type === 'input_audio_buffer.speech_stopped') avatar.setListening(false);
            if (message.type === 'response.function_call_arguments.done' && message.name === 'set_avatar_motion') {
                const motion = parseArguments(message.arguments); avatar.setMotion(motion); avatar.setBodyMotion(motion); realtime.sendFunctionOutput(message.call_id, {status: 'motion applied'});
            }
            if (message.type === 'response.function_call_arguments.done' && message.name === 'set_avatar_expression') {
                const expression = parseArguments(message.arguments); avatar.setExpression(expression); avatar.setGesture({type: expression.gesture, intensity: expression.gestureIntensity}); realtime.sendFunctionOutput(message.call_id, {status: 'expression applied'});
            }
        }});
    realtime.connect();
}

function setupRecorder() {
    recorder = new PCM16Audio((chunk) => {
        if (!recorder.isPlaying && realtime?.isOpen) realtime.appendInputAudioBase64(PCM16Audio.pcm16ToBase64(chunk));
    }, ({startTime, duration}) => {
        outputVisemeTracker?.onOutputChunk({startTime, duration});
    });
    outputVisemeTracker = createOutputTracker({
        analyser: recorder.createOutputAnalyser(),
        setViseme: (viseme) => avatar?.setViseme(viseme),
        debug: true,
    });
}
function openSettings() {
    document.getElementById('coffeeBaseUrl').value = settings.baseUrl;
    document.getElementById('coffeeModel').value = settings.model;
    document.getElementById('coffeeAvatar').value = settings.avatar;
    document.getElementById('coffeeApiKey').value = apiKey;
    document.getElementById('coffeeRemember').checked = settings.rememberKey;
    document.getElementById('coffeeSettingsPanel').hidden = false;
}
function saveCoffeeSettings() {
    settings = {...settings, baseUrl: document.getElementById('coffeeBaseUrl').value.trim() || defaults.baseUrl, model: document.getElementById('coffeeModel').value.trim() || defaults.model, avatar: document.getElementById('coffeeAvatar').value, rememberKey: document.getElementById('coffeeRemember').checked};
    apiKey = document.getElementById('coffeeApiKey').value.trim();
    settings.apiKey = settings.rememberKey ? apiKey : '';
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    document.getElementById('coffeeSettingsPanel').hidden = true;
    createAvatar();
    startRealtime();
}

window.addEventListener('resize', resizeAvatar);
document.getElementById('coffeeSettings').addEventListener('click', openSettings);
document.getElementById('coffeeLanguage').addEventListener('change', (event) => {
    const selected = event.target.value;
    if (!setLanguage(selected) || !realtime?.isOpen) return;
    sendUserText(`The customer interface language is now ${currentLanguage().speech}. From now on, speak only ${currentLanguage().speech} and use the localized menu. Acknowledge this briefly and continue helping with the current order.`);
});
document.getElementById('closeSettings').addEventListener('click', () => document.getElementById('coffeeSettingsPanel').hidden = true);
document.getElementById('saveCoffeeSettings').addEventListener('click', saveCoffeeSettings);
document.getElementById('payButton').addEventListener('click', () => showPayment());
document.getElementById('nextCustomerButton').addEventListener('click', resetForNextCustomer);
document.getElementById('closePayment').addEventListener('click', closePayment);
document.getElementById('paymentSuccess').addEventListener('click', () => handlePayment(true));
document.getElementById('paymentFailure').addEventListener('click', () => handlePayment(false));
document.getElementById('coffeeTextSend').addEventListener('click', () => { const input = document.getElementById('coffeeText'); sendUserText(input.value); input.value = ''; });
document.getElementById('coffeeText').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); document.getElementById('coffeeTextSend').click(); } });
document.getElementById('coffeeMic').addEventListener('click', async () => {
    const button = document.getElementById('coffeeMic');
    if (!micOn) { micOn = true; button.classList.add('recording'); await recorder.start(); }
    else { micOn = false; button.classList.remove('recording'); recorder.stop(); }
});

renderMenu(); renderBasket(); renderLanguageUI(); createAvatar(); setupRecorder();
if (!apiKey) openSettings(); else startRealtime();
