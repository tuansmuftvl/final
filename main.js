import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, onValue, update} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyD_9uOZ1W1MRl4xVFSgJPupC3YupEkRJh8",
    authDomain: "garden-monitori.firebaseapp.com",
    databaseURL: "https://garden-monitori-default-rtdb.firebaseio.com",
    projectId: "garden-monitori",
    storageBucket: "garden-monitori.firebasestorage.app",
    messagingSenderId: "193308209488",
    appId: "1:193308209488:web:c313aa0e229cb4f05ebc55",
    measurementId: "G-3F500Q9VG1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const nodes = ["Node1", "Node2", "Node3", "Node4"];

function createNodeUI(nodeName) {
    const container = document.createElement("div");
    container.className = "node";
    container.id = nodeName;  // Thiết lập ID riêng cho mỗi node
    container.innerHTML = `
        <h2>${nodeName}</h2>
        <div class="data-display">
            <p><i class="material-icons" style="color: red">thermostat</i>Nhiệt độ: <span id="temp-${nodeName}">Loading...</span> °C</p>
            <p><i class="material-icons" style="color: #1E90FF">water_drop</i>Độ ẩm: <span id="humid-${nodeName}">Loading...</span> %</p>
            <p><i class="material-icons" style="color: brown;">terrain</i>Độ ẩm đất: <span id="somo-${nodeName}">Loading...</span>%</p>
        </div>
    `;
    document.getElementById("nodes").appendChild(container);
}

function createChartUI(nodeName) {
    const container = document.createElement("div");
    container.className = "chart-container";
    container.innerHTML = `
        <h3>${nodeName}</h3>
        <canvas id="chart-${nodeName}"></canvas>
    `;
    document.getElementById("charts").appendChild(container);
}

function updateNodeData(nodeName, data) {
    document.getElementById(`temp-${nodeName}`).textContent = data.temp || "N/A";
    document.getElementById(`humid-${nodeName}`).textContent = data.humid || "N/A";
    document.getElementById(`somo-${nodeName}`).textContent = data.somo || "N/A";
}

function createChart(nodeName) {
    const ctx = document.getElementById(`chart-${nodeName}`).getContext("2d");
    const chartData = {
        labels: [],
        datasets: [
            {
                label: "Nhiệt độ (°C)",
                data: [],
                borderColor: "red",
                fill: false,
            },
            {
                label: "Độ ẩm (%)",
                data: [],
                borderColor: "blue",
                fill: false,
            },
            {
                label: "Độ ẩm đất (%)",
                data: [],
                borderColor: "green",
                fill: false,
            },
        ],
    };

    const chart = new Chart(ctx, {
        type: "line",
        data: chartData,
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.dataset.label || "";
                            const value = context.raw;
                            const time = new Date(chartData.labels[context.dataIndex]).toLocaleString("vi-VN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                            });
                            return `${label}: ${value} (${time})`;
                        },
                    },
                },
                
            },
            scales: {
                x: {
                    ticks: {
                        callback: function (value, index, values) {
                            const date = new Date(chartData.labels[index]);
                            return date.toLocaleTimeString("vi-VN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                            });
                        },
                    },
                },
            },            
        },
    });

    return chart;
}

// Tạo giao diện cho các node và biểu đồ
nodes.forEach((node) => {
    createNodeUI(node);
    createChartUI(node);

    const chart = createChart(node);
    const dbRef = ref(database, node);

    onValue(dbRef, (snapshot) => {
        if (snapshot.exists()) {
            const nodeData = snapshot.val();
            const timestamps = Object.keys(nodeData).sort((a, b) => b - a);
            const latestTimestamps = timestamps.slice(0, 20).reverse();

            const labels = latestTimestamps.map((ts) => new Date(Number(ts) * 1000).toISOString());
            const tempData = [];
            const humidData = [];
            const somoData = [];

            latestTimestamps.forEach((ts) => {
                const entry = nodeData[ts];
                tempData.push(entry.temp || 0);
                humidData.push(entry.humid || 0);
                somoData.push(entry.somo || 0);
            });

            chart.data.labels = labels;
            chart.data.datasets[0].data = tempData;
            chart.data.datasets[1].data = humidData;
            chart.data.datasets[2].data = somoData;
            chart.update();

            const latestData = nodeData[latestTimestamps[latestTimestamps.length - 1]];
            updateNodeData(node, {
                temp: latestData.temp || "N/A",
                humid: latestData.humid || "N/A",
                somo: latestData.somo || "N/A",
            });
        }
    });
});

// Điều khiển bơm
const pumpFlowInput = document.getElementById("pump-flow");
const pumpFlowValue = document.getElementById("pump-flow-value");
const pumpDurationInput = document.getElementById("pump-duration");
const pumpOnButton = document.getElementById("pump-on");
const pumpOffButton = document.getElementById("pump-off");
const pumpDurationDisplay = document.getElementById("pump-duration-value");

const cancelScheduleButton = document.getElementById("cancel-schedule");

let scheduledCountdownInterval = null;  // Đảm bảo biến đếm ngược cho việc hẹn giờ là toàn cục
let scheduledRemainingTime = 0;  // Thời gian còn lại cho việc hẹn giờ

let remainingTime = 0;
let countdownInterval = null;  // Để kiểm soát quá trình đếm ngược
let globalEndTime = null;      // Biến lưu thời điểm kết thúc bơm (end_time)

pumpFlowInput.addEventListener("input", () => {
    pumpFlowValue.textContent = pumpFlowInput.value;
});

pumpOnButton.addEventListener("click", () => {
    const flowValue = parseInt(pumpFlowInput.value, 10) / 50 * 100;
    const durationValue = parseInt(pumpDurationInput.value, 10);

    if (isNaN(durationValue) || durationValue <= 0) {
        alert("Thời gian bơm không hợp lệ.");
        return;
    }

    // Tính thời gian kết thúc bơm
    const startTime = Date.now();
    const endTime = startTime + durationValue * 60 * 1000;

    // Lưu lên Firebase
    update(ref(database, "pump"), {
        flow: flowValue,
        pump_event: 1,
        duration: durationValue,
        start_time: startTime,
        end_time: endTime
    });
});


pumpOffButton.addEventListener("click", () => {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }

    updatePumpDurationDisplay(0);

    update(ref(database, "pump"), {
        duration: '',
        pump_event: 0,
        start_time: '',
        end_time: ''
    });
});


function updatePumpDurationDisplay(remainingTime) {
    if (isNaN(remainingTime)) remainingTime = 0;

    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    pumpDurationDisplay.textContent = `${minutes} phút ${seconds} giây`;
}



const scheduledFlowInput = document.getElementById("scheduled-flow");
const scheduledFlowValue = document.getElementById("scheduled-flow-value");
const startHourInput = document.getElementById("start-hour");
const startMinuteInput = document.getElementById("start-minute");
const startSecondInput = document.getElementById("start-second");
const scheduleDurationInput = document.getElementById("schedule-duration");
const schedulePumpButton = document.getElementById("schedule-pump");

scheduledFlowInput.addEventListener("input", () => {
    // Lấy giá trị slider (0 đến 50)
    const sliderVal = parseInt(scheduledFlowInput.value, 10);
    // Cập nhật giao diện hiển thị
    scheduledFlowValue.textContent = sliderVal;
    // Chuyển đổi sang giá trị phần trăm (0-100)
    const flowPercentage = sliderVal / 50 * 100;
    // Cập nhật giá trị lưu lượng vào Firebase tại node "scheduled_pump"
    update(ref(database, "scheduled_pump"), {
        flow: flowPercentage
    });
});

schedulePumpButton.addEventListener("click", () => {
    const flowValue = parseInt(scheduledFlowInput.value, 10) / 50 * 100;
    const durationValue = parseInt(scheduleDurationInput.value, 10);
    const startHour = parseInt(startHourInput.value, 10);
    const startMinute = parseInt(startMinuteInput.value, 10);
    const startSecond = parseInt(startSecondInput.value, 10);

    if (isNaN(durationValue) || durationValue <= 0) {
        alert("Thời gian bơm không hợp lệ.");
        return;
    }
    if (isNaN(startHour) || isNaN(startMinute) || isNaN(startSecond)) {
        alert("Thời gian bắt đầu không hợp lệ.");
        return;
    }

    const now = new Date();
    let startTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        startHour,
        startMinute,
        startSecond
    );

    if (startTime <= now) {
        alert("Thời gian bắt đầu đã qua, bơm sẽ được lên lịch cho ngày hôm sau.");
        // Bạn có thể tự động chuyển sang ngày hôm sau hoặc yêu cầu nhập lại
    }

    // Cập nhật dữ liệu hẹn giờ (giờ, phút, giây, flow, duration)
    update(ref(database, "scheduled_pump"), {
        flow: flowValue,
        hour: startHour,
        minute: startMinute,
        second: startSecond,
        duration: durationValue  // thời gian bơm (phút)
    });

    // Gọi hàm lên lịch bơm hàng ngày với các tham số đã nhập
    scheduleDailyPump(startTime, flowValue, durationValue);

    alert(`Hẹn giờ bơm thành công! Bơm sẽ bật vào ${startHour}:${startMinute}:${startSecond} mỗi ngày và tắt sau ${durationValue} phút.`);
});



let scheduledTimeoutId = null;   // Dùng cho lần bật đầu tiên
let scheduledIntervalId = null;  // Dùng cho các lần lặp lại hàng ngày

cancelScheduleButton.addEventListener("click", () => {
    // Hủy bỏ timer cho lần bật đầu tiên nếu đang chạy
    if (scheduledTimeoutId) {
        clearTimeout(scheduledTimeoutId);
        scheduledTimeoutId = null;
    }
    // Hủy bỏ timer cho các lần lặp lại hàng ngày nếu đang chạy
    if (scheduledIntervalId) {
        clearInterval(scheduledIntervalId);
        scheduledIntervalId = null;
    }

    // Cập nhật Firebase để reset thông tin hẹn giờ (giờ, phút, giây, lưu lượng)
    update(ref(database, "scheduled_pump"), {
         hour: '',
         minute: '',
         second: '',
         flow: '',
         duration: ''
    });

    // Thông báo hủy hẹn giờ thành công và reset giao diện nhập liệu
    alert("Hủy hẹn giờ bơm thành công!");
    startHourInput.value = '';
    startMinuteInput.value = '';
    startSecondInput.value = '';
    scheduleDurationInput.value = '';
});



// Lắng nghe thay đổi của pump_event trên Firebase
const pumpRef = ref(database, "pump");
onValue(pumpRef, (snapshot) => {
    const pumpData = snapshot.val();
    if (!pumpData) return;
    //if (pumpData) {
        const pumpEvent = pumpData.pump_event;
        const indicator = document.getElementById("pump-status-indicator");
        // Nếu pump_event bằng 1 thì đổi màu đèn thành xanh lá, ngược lại màu đỏ
        if (pumpEvent === 1) {
            indicator.style.backgroundColor = "green";
        } else {
            indicator.style.backgroundColor = "red";
        }

        // Đồng bộ thêm thời gian bơm:
        if (typeof pumpData.duration !== "undefined" && pumpData.duration !== null) {
            pumpDurationInput.value = pumpData.duration;
        }
        
        // --- Cập nhật lưu lượng bơm ---
        if (typeof pumpData.flow !== "undefined") {
            // Chuyển đổi giá trị từ phần trăm (0-100) sang giá trị slider (0-50)
            const sliderValue = pumpData.flow / 100 * 50;
            pumpFlowInput.value = sliderValue;
            pumpFlowValue.textContent = sliderValue;
        }
    //}
    if (pumpEvent === 0) {
        // Nếu bơm tắt, dừng đếm ngược trên tất cả thiết bị
        clearInterval(countdownInterval);
        countdownInterval = null;
        updatePumpDurationDisplay(0);
        return;  // Thoát sớm để không tiếp tục xử lý thời gian
    }
    
    if (pumpData.end_time) {
        globalEndTime = pumpData.end_time;
        startCountdown();
    }
});

const scheduledPumpRef = ref(database, "scheduled_pump");
onValue(scheduledPumpRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        // Cập nhật giá trị cho các ô nhập liệu giờ, phút, giây nếu có dữ liệu
        if (typeof data.hour !== "undefined") {
            startHourInput.value = data.hour;
        }
        if (typeof data.minute !== "undefined") {
            startMinuteInput.value = data.minute;
        }
        if (typeof data.second !== "undefined") {
            startSecondInput.value = data.second;
        }
        // Cũng cập nhật giá trị lưu lượng nếu cần (đã có xử lý ở phần trước)
        if (typeof data.flow !== "undefined") {
            const sliderValue = data.flow / 100 * 50;
            scheduledFlowInput.value = sliderValue;
            scheduledFlowValue.textContent = sliderValue;
        }

        if (typeof data.duration !== "undefined" && data.duration !== null) {
            scheduleDurationInput.value = data.duration;
        }
    }
});


function scheduleDailyPump(startTime, flowValue, durationValue) {
    const now = new Date();

    // Nếu thời gian bắt đầu đã qua, chuyển sang ngày hôm sau
    if (startTime <= now) {
        startTime.setDate(startTime.getDate() + 1);
    }

    // Tính thời gian chờ cho lần bật đầu tiên (tính bằng mili giây)
    const initialDelay = startTime - now;

    // Hàm bật và tắt bơm theo thời gian đã định
    const activatePump = () => {
        update(ref(database, "pump"), {
            flow: flowValue,
            pump_event: 1,
        });
        // Sau khi bật bơm, đặt timeout tắt bơm sau durationValue phút
        setTimeout(() => {
            update(ref(database, "pump"), {
                pump_event: 0,
            });
        }, durationValue * 60 * 1000); // durationValue (phút) -> mili giây
    };

    // Đặt timer cho lần bật đầu tiên và lưu vào biến toàn cục
    scheduledTimeoutId = setTimeout(() => {
        activatePump();

        // Sau lần bật đầu tiên, đặt lặp lại hàng ngày và lưu timer interval
        scheduledIntervalId = setInterval(() => {
            activatePump();
        }, 24 * 60 * 60 * 1000); // Mỗi 24 giờ
    }, initialDelay);
}



function startCountdown() {
    if (!globalEndTime) return;

    // Xóa interval cũ nếu có
    if (countdownInterval) clearInterval(countdownInterval);

    function updateCountdown() {
        let remainingTime = Math.floor((globalEndTime - Date.now()) / 1000);

        if (remainingTime <= 0) {
            remainingTime = 0;
            clearInterval(countdownInterval);
            countdownInterval = null;

            // Reset trạng thái bơm trên Firebase khi hết giờ
            update(ref(database, "pump"), {
                pump_event: 0,
                start_time: '',
                end_time: '',
                duration: ''
            });
        }

        updatePumpDurationDisplay(remainingTime);
    }

    // Cập nhật lần đầu
    updateCountdown();

    // Tạo interval cập nhật mỗi giây
    countdownInterval = setInterval(updateCountdown, 1000);
}
