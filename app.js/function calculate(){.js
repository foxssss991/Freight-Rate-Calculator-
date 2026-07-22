let history = JSON.parse(localStorage.getItem("freightHistory")) || [];

// Защита от XSS
function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

// Автоматический расчет дистанции через открытое API
async function calculateMiles() {
    const origin = document.getElementById("origin").value.trim();
    const destination = document.getElementById("destination").value.trim();
    const btn = document.getElementById("calcMilesBtn");

    if (!origin || !destination) {
        alert("Please enter both Origin and Destination.");
        return;
    }

    btn.innerText = "⏳ Loading...";
    btn.disabled = true;

    try {
        const originRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(origin)}`);
        const originData = await originRes.json();
        if (originData.length === 0) throw new Error("Origin not found");
        const originCoords = `${originData[0].lon},${originData[0].lat}`;

        const destRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`);
        const destData = await destRes.json();
        if (destData.length === 0) throw new Error("Destination not found");
        const destCoords = `${destData[0].lon},${destData[0].lat}`;

        const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${originCoords};${destCoords}?overview=false`);
        const routeData = await routeRes.json();
        
        if (routeData.code === "Ok") {
            const meters = routeData.routes[0].distance;
            const miles = Math.round(meters / 1609.34);
            document.getElementById("loaded").value = miles;
        } else {
            throw new Error("Route calculation failed");
        }
    } catch (error) {
        alert("Error calculating distance: " + error.message + "\nPlease enter miles manually.");
    } finally {
        btn.innerText = "📍 Get Miles";
        btn.disabled = false;
    }
}

// Умный расчет маржи брокера
function suggestMargin() {
    const miles = Number(document.getElementById("loaded").value) || 0;
    const carrierPay = Number(document.getElementById("carrier").value) || 0;
    const equipment = document.getElementById("equipment").value;

    if (miles === 0 && carrierPay === 0) {
        alert("Please get Loaded Miles or enter Carrier Pay first.");
        return;
    }

    let suggestedMargin = 0;

    if (carrierPay > 0) {
        suggestedMargin = carrierPay * 0.15; // 15% наценка
    } else {
        if (miles < 250) suggestedMargin = 125;
        else if (miles < 600) suggestedMargin = 200;
        else if (miles < 1200) suggestedMargin = 300;
        else if (miles < 2000) suggestedMargin = 450;
        else suggestedMargin = 600;
    }

    if (equipment === "Reefer" || equipment === "Step Deck" || equipment === "Flatbed") {
        suggestedMargin += 50; 
    }

    suggestedMargin = Math.round(suggestedMargin / 10) * 10;
    if (suggestedMargin < 150) suggestedMargin = 150; // Минимальная маржа

    document.getElementById("margin").value = suggestedMargin;
}

// Ручной расчет и добавление в историю
function calculate() {
    const origin = document.getElementById("origin").value || "Unknown";
    const destination = document.getElementById("destination").value || "Unknown";
    
    if (origin === "Unknown" || destination === "Unknown") {
        alert("Please enter Origin and Destination.");
        return;
    }

    const loadedMiles = Number(document.getElementById("loaded").value) || 0;
    const deadhead = Number(document.getElementById("deadhead").value) || 0;
    const carrierPay = Number(document.getElementById("carrier").value) || 0;
    const margin = Number(document.getElementById("margin").value) || 0;
    const fuel = Number(document.getElementById("fuel").value) || 0;
    const tolls = Number(document.getElementById("tolls").value) || 0;
    const lumper = Number(document.getElementById("lumper").value) || 0;

    const totalMiles = loadedMiles + deadhead;
    const customerRate = carrierPay + margin + fuel + tolls + lumper;
    const carrierRPM = loadedMiles > 0 ? carrierPay / loadedMiles : 0;
    const customerRPM = loadedMiles > 0 ? customerRate / loadedMiles : 0;

    document.getElementById("rMiles").innerHTML = totalMiles.toFixed(0) + " mi";
    document.getElementById("rRate").innerHTML = "$" + customerRate.toFixed(2);
    document.getElementById("rCarrier").innerHTML = "$" + carrierRPM.toFixed(2);
    document.getElementById("rCustomer").innerHTML = "$" + customerRPM.toFixed(2);
    document.getElementById("rProfit").innerHTML = "$" + margin.toFixed(2);

    let statusElement = document.getElementById("rStatus");

    if (customerRPM >= 3) {
        statusElement.innerHTML = "🟢 Excellent Rate";
        statusElement.className = "status-good";
    } else if (customerRPM >= 2) {
        statusElement.innerHTML = "🟡 Average Rate";
        statusElement.className = "status-average";
    } else {
        statusElement.innerHTML = "🔴 Low Rate";
        statusElement.className = "status-low";
    }

    const load = {
        date: new Date().toLocaleString(),
        route: origin + " → " + destination,
        rate: customerRate.toFixed(2),
        rpm: customerRPM.toFixed(2),
        profit: margin.toFixed(2)
    };

    history.push(load);
    localStorage.setItem("freightHistory", JSON.stringify(history));

    document.getElementById("origin").value = "";
    document.getElementById("destination").value = "";
    
    renderHistory();
}

// Отрисовка таблицы истории
function renderHistory() {
    const body = document.getElementById("historyBody");
    let htmlStr = ""; 

    history.forEach((item, index) => {
        htmlStr += `
        <tr>
            <td>${escapeHTML(item.date)}</td>
            <td>${escapeHTML(item.route)}</td>
            <td>$${escapeHTML(item.rate)}</td>
            <td>$${escapeHTML(item.profit)}</td>
            <td>
                <button class="delete" onclick="deleteLoad(${index})">❌</button>
            </td>
        </tr>`;
    });

    body.innerHTML = htmlStr;
}

// Удаление записи
function deleteLoad(index) {
    history.splice(index, 1);
    localStorage.setItem("freightHistory", JSON.stringify(history));
    renderHistory();
}

// Очистка истории
function clearHistory() {
    if (confirm("Delete all history?")) {
        history = [];
        localStorage.removeItem("freightHistory");
        renderHistory();
    }
}

// Экспорт в CSV (Excel)
function exportCSV() {
    if (history.length === 0) {
        alert("History is empty");
        return;
    }
    let csv = "Date,Route,Rate,RPM,Profit\n";
    history.forEach(item => {
        let safeRoute = '"' + item.route.replace(/"/g, '""') + '"';
        csv += `${item.date},${safeRoute},$${item.rate},${item.rpm},$${item.profit}\n`;
    });
    let blob = new Blob([csv], { type: "text/csv" });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "freight_history.csv";
    link.click();
}

// Полный автоматический расчет (ставка + маржа)
function autoRate() {
    const miles = Number(document.getElementById("loaded").value) || 0;
    const deadhead = Number(document.getElementById("deadhead").value) || 0;
    const equipment = document.getElementById("equipment").value;
    const market = Number(document.getElementById("market").value) || 1.0;

    if (miles === 0) {
        alert("Please calculate or enter Loaded Miles for auto-calculation.");
        return;
    }

    let baseRPM = 0;
    switch (equipment) {
        case "Dry Van": baseRPM = 2.20; break;
        case "Reefer": baseRPM = 2.60; break;
        case "Flatbed": baseRPM = 2.80; break;
        case "Step Deck": baseRPM = 3.00; break;
        default: baseRPM = 2.20;
    }

    let carrierRPM = baseRPM * market;
    let carrierRate = miles * carrierRPM;
    let deadheadPay = deadhead * 1.20;
    carrierRate += deadheadPay;
    
    // Используем алгоритм умной маржи
    let margin = carrierRate * 0.15;
    if (equipment === "Reefer" || equipment === "Step Deck" || equipment === "Flatbed") margin += 50;
    margin = Math.round(margin / 10) * 10;
    if (margin < 150) margin = 150;

    let customerRate = carrierRate + margin;

    document.getElementById("carrier").value = Math.round(carrierRate);
    document.getElementById("margin").value = margin;

    alert(
        "Recommended Customer Rate: $" + Math.round(customerRate) +
        "\nCarrier Pay: $" + Math.round(carrierRate) +
        "\nCarrier RPM: $" + carrierRPM.toFixed(2)
    );
}

// Отрисовать историю при первой загрузке страницы
renderHistory();