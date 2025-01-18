let t = 0;
let k = 7;
let particles = [];
const NUM_PARTICLES = 50;

// Переменные для отслеживания руки
let detector;
let video;
let predictions = [];
let handX = 0;
let handY = 0;
let handSpeed = 0;
let previousHandX = 0;
let previousHandY = 0;
let fingerDistances = [0, 0, 0, 0, 0];
let handRotation = 0;
let handScale = 1;
let gestureEnergy = 0;

// Размеры и позиция для превью камеры
let previewWidth = 160;
let previewHeight = 120;
let previewMargin = 20;

// Звуковые переменные
let reverb;
let delay;
let oscillators = [];
let noiseGenerators = [];
let masterVolume = 0.3;
let isAudioStarted = false;

// Recording variables
let mediaRecorder;
let recordedChunks = [];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('startRecording').onclick = startRecording;
    document.getElementById('stopRecording').onclick = stopRecording;
});

async function startRecording() {
    try {
        // Get display media (screen capture)
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        mediaRecorder = new MediaRecorder(displayStream, {
            mimeType: 'video/webm;codecs=vp8,opus'
        });

        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            document.body.appendChild(a);
            a.style.display = 'none';
            a.href = url;
            a.download = `recording-${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            // Stop all tracks
            displayStream.getTracks().forEach(track => track.stop());
        };

        // Start recording
        mediaRecorder.start(1000); // Collect data every second
        document.getElementById('startRecording').style.display = 'none';
        document.getElementById('stopRecording').style.display = 'block';
    } catch (err) {
        console.error('Error during recording:', err);
        alert('Не удалось начать запись. Убедитесь, что вы дали разрешение на запись экрана и звука.');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        document.getElementById('startRecording').style.display = 'block';
        document.getElementById('stopRecording').style.display = 'none';
    }
}

function setup() {
  // Создаем холст в формате Instagram Reels (9:16)
  let w = windowWidth;
  let h = (windowWidth * 16) / 9;
  if (h > windowHeight) {
    h = windowHeight;
    w = (windowHeight * 9) / 16;
  }
  createCanvas(w, h);
  
  // Настройка видео и распознавания руки
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();
  
  const options = {
    flipHorizontal: false,
    maxContinuousChecks: Infinity,
    detectionConfidence: 0.8,
    scoreThreshold: 0.75,
    iouThreshold: 0.3,
  }
  
  detector = ml5.handpose(video, options, modelReady);
  detector.on("predict", results => {
    predictions = results;
    if (predictions.length > 0) {
      previousHandX = handX;
      previousHandY = handY;
      handX = predictions[0].landmarks[9][0];
      handY = predictions[0].landmarks[9][1];
      handSpeed = dist(previousHandX, previousHandY, handX, handY);
      
      const thumb = predictions[0].landmarks[4];
      const index = predictions[0].landmarks[8];
      const middle = predictions[0].landmarks[12];
      const ring = predictions[0].landmarks[16];
      const pinky = predictions[0].landmarks[20];
      
      fingerDistances[0] = dist(thumb[0], thumb[1], index[0], index[1]) / 100;
      fingerDistances[1] = dist(index[0], index[1], middle[0], middle[1]) / 100;
      fingerDistances[2] = dist(middle[0], middle[1], ring[0], ring[1]) / 100;
      fingerDistances[3] = dist(ring[0], ring[1], pinky[0], pinky[1]) / 100;
      fingerDistances[4] = dist(thumb[0], thumb[1], pinky[0], pinky[1]) / 100;
      
      handRotation = atan2(pinky[1] - thumb[1], pinky[0] - thumb[0]);
      handScale = dist(thumb[0], thumb[1], pinky[0], pinky[1]) / 100;
      gestureEnergy = (handSpeed + fingerDistances.reduce((a, b) => a + b, 0)) / 6;
      
      if (isAudioStarted) {
        updateSound();
      }
    }
  });

  setupSound();
  setupParticles();
  
  // Добавляем обработчик для кнопки старта
  let startButton = document.getElementById('startButton');
  startButton.addEventListener('click', () => {
    userStartAudio();
    isAudioStarted = true;
    startButton.style.display = 'none';
  });
}

function setupSound() {
  // Создаем эффекты
  reverb = new p5.Reverb();
  delay = new p5.Delay();
  
  // Настраиваем реверберацию
  reverb.set(5, 2); // время реверберации и затухание
  
  // Настраиваем дилей
  delay.setType('pingPong');
  delay.process(reverb, 0.12, 0.7, 2300);
  
  // Создаем осцилляторы для каждого пальца
  for(let i = 0; i < 5; i++) {
    let osc = new p5.Oscillator();
    osc.setType('sine');
    osc.freq(220 * pow(1.5, i)); // гармонические частоты
    osc.amp(0);
    osc.start();
    oscillators.push(osc);
    
    // Подключаем эффекты
    osc.disconnect();
    osc.connect(reverb);
    reverb.connect(delay);
    
    // Создаем генератор шума для каждого пальца
    let noise = new p5.Noise('pink');
    noise.amp(0);
    noise.start();
    noiseGenerators.push(noise);
    
    // Подключаем эффекты к шуму
    noise.disconnect();
    noise.connect(reverb);
  }
}

function updateSound() {
  if (!isAudioStarted) return;
  
  // Обновляем звук для каждого пальца
  for(let i = 0; i < 5; i++) {
    let osc = oscillators[i];
    let noise = noiseGenerators[i];
    let fingerDist = fingerDistances[i];
    
    // Базовая частота зависит от положения пальца по вертикали
    let baseFreq = map(predictions[0].landmarks[4 + i * 4][1], height, 0, 150, 800);
    
    // Модуляция частоты на основе движения и поворота руки
    let freqMod = sin(frameCount * 0.01 + i + handRotation) * 50 * handSpeed;
    osc.freq(baseFreq + freqMod);
    
    // Амплитуда зависит от расстояния между пальцами и общей энергии
    let amp = map(fingerDist * gestureEnergy, 0, 2, 0, 0.1) * masterVolume;
    osc.amp(amp, 0.1);
    
    // Шум зависит от скорости движения и положения по горизонтали
    let noiseAmp = map(handSpeed * fingerDist, 0, 10, 0, 0.05) * masterVolume;
    noise.amp(noiseAmp, 0.1);
    
    // Панорамирование на основе положения пальца по горизонтали
    let pan = map(predictions[0].landmarks[4 + i * 4][0], 0, width, -1, 1);
    osc.pan(pan);
    noise.pan(pan);
  }
  
  // Обновляем параметры эффектов на основе жестов
  let reverbAmount = map(gestureEnergy, 0, 2, 0.5, 0.9);
  reverb.drywet(reverbAmount);
  
  let delayTime = map(handScale, 0.5, 2, 0.1, 0.5);
  delay.delayTime(delayTime);
  
  // Модулируем время реверберации на основе поворота руки
  let reverbTime = map(abs(handRotation), 0, PI, 2, 6);
  reverb.set(reverbTime, 2);
}

function setupParticles() {
  for(let i = 0; i < NUM_PARTICLES; i++) {
    particles.push({
      x: random(width),
      y: random(height),
      size: random(1, 3),
      speed: random(0.5, 2),
      angle: random(TWO_PI),
      phase: random(TWO_PI)
    });
  }
}

function modelReady() {
  console.log("Model ready!");
}

function draw() {
  let bgValue = map(gestureEnergy, 0, 2, 15, 40);
  background(bgValue);
  
  // Основные эффекты
  drawMainEffects();
  
  // Отрисовка стилизованного превью камеры
  drawStylizedWebcam();
  
  t = t + 1 + (gestureEnergy * 0.5);
}

function drawMainEffects() {
  // Визуализация влияния руки
  if (predictions.length > 0) {
    drawHandInfluence();
  }

  // Вихревой эффект
  push();
  noFill();
  translate(width/2, height/2);
  for(let i = 0; i < 100; i++) {
    let fingerInfluence = sin(fingerDistances[i % 5] * PI);
    let rotationEffect = sin(handRotation + i * 0.1);
    let angle = i * 0.1 + t * (0.01 + handSpeed * 0.0001) + rotationEffect;
    let r = i * 2 * (1 + fingerInfluence * 0.3);
    let x = cos(angle) * r;
    let y = sin(angle) * r;
    stroke(255, 5 + fingerInfluence * 10);
    point(x, y);
  }
  pop();
  
  // Адаптивные круги
  push();
  noFill();
  let maxDim = max(width, height);
  for(let i = 0; i < 5; i++) {
    let fingerFactor = map(fingerDistances[i], 0, 2, 0.8, 1.5);
    let rotationInfluence = map(sin(handRotation + i), -1, 1, 0.9, 1.1);
    let size = map(sin(t/100 + i), -1, 1, maxDim*0.2, maxDim*0.8) 
               * fingerFactor * rotationInfluence;
    
    stroke(255, 10 + fingerDistances[i] * 20);
    push();
    translate(width/2, height/2);
    rotate(handRotation * (i + 1) * 0.1);
    circle(0, 0, size);
    pop();
  }
  pop();
  
  // Роза Мунди
  push();
  translate(width/2, height/2);
  rotate(handRotation * 0.5);
  let radius = min(width, height) * 0.3 * handScale;
  
  for(let j = 0; j < 3; j++) {
    let kOffset = map(sin(gestureEnergy * 2 + j), -1, 1, -1, 1);
    k = map(handY, 0, height, 5, 9) + kOffset;
    
    for(let angle = 0; angle < TWO_PI * 10; angle += 0.02) {
      let fingerMod = sin(angle * fingerDistances[j % 5] * 2);
      let r = radius * sin(k * angle) * (1 + j * 0.1) * (1 + fingerMod * 0.2);
      let x = r * cos(angle);
      let y = r * sin(angle);
      
      let brightness = map(sin(angle + t/50 + gestureEnergy), -1, 1, 150, 255);
      stroke(brightness, 40 - j * 10);
      strokeWeight(1 - j * 0.2 + fingerMod * 0.5);
      point(x, y);
    }
  }
  pop();
  
  // Частицы
  drawParticles();
  
  // Линии
  drawLines();
  
  // Виньетка
  drawVignette();
}

function drawHandInfluence() {
  push();
  let palm = predictions[0].landmarks[9];
  let scaledPalmX = palm[0] * width/640;
  let scaledPalmY = palm[1] * height/480;

  // Создаем массив точек для пальцев
  let fingers = [];
  for(let i = 0; i < 5; i++) {
    let tip = predictions[0].landmarks[4 + i * 4];
    let base = predictions[0].landmarks[1 + i * 4];
    fingers.push({
      tip: createVector(tip[0] * width/640, tip[1] * height/480),
      base: createVector(base[0] * width/640, base[1] * height/480)
    });
  }

  // Рисуем энергетические линии между пальцами
  noFill();
  for(let i = 0; i < fingers.length; i++) {
    let nextI = (i + 1) % fingers.length;
    let strength = fingerDistances[i] * 2;
    
    // Энергетические линии между пальцами
    for(let j = 0; j < 5; j++) {
      let alpha = map(j, 0, 5, 150, 30);
      stroke(255, alpha);
      strokeWeight(map(j, 0, 5, 2, 0.5));
      
      beginShape();
      for(let t = 0; t <= 1; t += 0.1) {
        let x = lerp(fingers[i].tip.x, fingers[nextI].tip.x, t);
        let y = lerp(fingers[i].tip.y, fingers[nextI].tip.y, t);
        let offset = noise(x * 0.01, y * 0.01, frameCount * 0.02) * strength * 20;
        x += cos(handRotation) * offset;
        y += sin(handRotation) * offset;
        curveVertex(x, y);
      }
      endShape();
    }
  }

  // Рисуем частицы вокруг пальцев
  for(let finger of fingers) {
    for(let i = 0; i < 5; i++) {
      let angle = noise(finger.tip.x * 0.01, finger.tip.y * 0.01, frameCount * 0.02) * TWO_PI;
      let radius = 20 + noise(finger.tip.x * 0.02, finger.tip.y * 0.02, frameCount * 0.01) * 30;
      let x = finger.tip.x + cos(angle) * radius;
      let y = finger.tip.y + sin(angle) * radius;
      
      let particleSize = map(noise(x * 0.1, y * 0.1, frameCount * 0.05), 0, 1, 2, 8);
      let alpha = map(noise(x * 0.05, y * 0.05, frameCount * 0.02), 0, 1, 50, 150);
      
      fill(255, alpha);
      noStroke();
      circle(x, y, particleSize);
    }
  }

  // Рисуем энергетическое поле вокруг ладони
  let palmRadius = 50 + sin(frameCount * 0.1) * 10;
  for(let i = 0; i < 360; i += 5) {
    let angle = radians(i);
    let noise1 = noise(cos(angle) * 0.1, sin(angle) * 0.1, frameCount * 0.02);
    let noise2 = noise(cos(angle) * 0.2, sin(angle) * 0.2, frameCount * 0.01);
    let r = palmRadius * (1 + noise1 * 0.5);
    let x = scaledPalmX + cos(angle) * r;
    let y = scaledPalmY + sin(angle) * r;
    
    let alpha = map(noise2, 0, 1, 30, 100);
    stroke(255, alpha);
    strokeWeight(noise2 * 2);
    
    line(scaledPalmX, scaledPalmY, x, y);
  }

  // Рисуем следы движения
  if (handSpeed > 1) {
    let trailLength = map(handSpeed, 1, 10, 5, 20);
    let trailWidth = map(handSpeed, 1, 10, 1, 4);
    
    for(let finger of fingers) {
      stroke(255, 100);
      strokeWeight(trailWidth);
      noFill();
      
      beginShape();
      for(let i = 0; i < trailLength; i++) {
        let t = i / trailLength;
        let x = lerp(finger.tip.x, finger.base.x, t);
        let y = lerp(finger.tip.y, finger.base.y, t);
        
        let offset = noise(x * 0.1, y * 0.1, frameCount * 0.05) * handSpeed * 2;
        x += cos(handRotation) * offset;
        y += sin(handRotation) * offset;
        
        vertex(x, y);
      }
      endShape();
    }
  }

  // Визуализация общей энергии жеста
  let energyRadius = 100 + gestureEnergy * 50;
  noFill();
  for(let i = 0; i < 5; i++) {
    let alpha = map(i, 0, 5, 100, 20);
    stroke(255, alpha);
    strokeWeight(map(i, 0, 5, 2, 0.5));
    
    beginShape();
    for(let angle = 0; angle < TWO_PI; angle += 0.1) {
      let r = energyRadius * (1 + noise(cos(angle), sin(angle), frameCount * 0.02) * 0.3);
      let x = scaledPalmX + cos(angle + handRotation) * r;
      let y = scaledPalmY + sin(angle + handRotation) * r;
      vertex(x, y);
    }
    endShape(CLOSE);
  }
  pop();
}

function drawParticles() {
  push();
  for(let particle of particles) {
    let fingerInfluence = fingerDistances[floor(random(5))];
    particle.angle += (gestureEnergy * 0.1 + fingerInfluence * 0.05);
    particle.phase += 0.02;
    
    let baseSpeed = particle.speed * (1 + gestureEnergy * 0.5);
    particle.x += cos(particle.angle) * baseSpeed;
    particle.y += sin(particle.angle) * baseSpeed;
    
    if (predictions.length > 0) {
      for(let i = 0; i < 5; i++) {
        let finger = predictions[0].landmarks[4 + i * 4];
        let d = dist(finger[0] * width/640, finger[1] * height/480, particle.x, particle.y);
        if(d < 100) {
          let repelAngle = atan2(particle.y - finger[1] * height/480, 
                                particle.x - finger[0] * width/640);
          particle.x += cos(repelAngle) * (100 - d) * 0.2;
          particle.y += sin(repelAngle) * (100 - d) * 0.2;
        }
      }
    }
    
    if(particle.x < 0) particle.x = width;
    if(particle.x > width) particle.x = 0;
    if(particle.y < 0) particle.y = height;
    if(particle.y > height) particle.y = 0;
    
    let distToCenter = dist(particle.x, particle.y, width/2, height/2);
    let sizeModulation = sin(particle.phase + gestureEnergy);
    let size = particle.size * (1 + sizeModulation * 0.5);
    let alpha = map(distToCenter, 0, width/2, 50, 10) * (1 + gestureEnergy * 0.5);
    
    fill(255, alpha);
    noStroke();
    circle(particle.x, particle.y, size);
  }
  pop();
}

function drawLines() {
  push();
  translate(0, height/2);
  for (let x = 0; x < width; x = x + 3) {
    let n = noise(x/(width*0.5), t/200);
    let y = map(n, 0, 1, -height/2, height/2);
    
    let handEffect = 0;
    if (predictions.length > 0) {
      for(let i = 0; i < 5; i++) {
        let finger = predictions[0].landmarks[4 + i * 4];
        let d = dist(x, y + height/2, finger[0] * width/640, finger[1] * height/480);
        handEffect += map(d, 0, 200, 30, 0) * fingerDistances[i];
      }
      handEffect /= 5;
    }
    
    let gestureEffect = sin(x * 0.01 + gestureEnergy * 2) * 20;
    let rotationEffect = cos(x * 0.005 + handRotation) * 10;
    
    let strokeW = map(noise(x/100, t/100), 0, 1, 0.5, 2) + 
                 handEffect + abs(gestureEffect * 0.1);
    strokeWeight(strokeW);
    
    let alpha = map(sin(x/30 + t/50 + gestureEnergy), -1, 1, 20, 50);
    let brightness = map(noise(x/(width*0.75), t/200), 0, 1, 180, 255);
    stroke(brightness, alpha);
    
    let offset = sin(x/(width*0.125) + t/30) * (height*0.05) + gestureEffect;
    let centerOffset = sin(t/60) * (width*0.125) + rotationEffect;
    
    line(x, y + offset, width/2 + centerOffset, height/2);
    line(x, y - offset, width/2 - centerOffset, -height/2);
  }
  pop();
}

function drawVignette() {
  push();
  let vignette = drawingContext.createRadialGradient(
    width/2, height/2, 0,
    width/2, height/2, width*0.7
  );
  let vignetteIntensity = map(gestureEnergy, 0, 2, 0.3, 0.6);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(0,0,0,${vignetteIntensity})`);
  drawingContext.fillStyle = vignette;
  rect(0, 0, width, height);
  pop();
}

function drawStylizedWebcam() {
  push();
  // Получаем изображение с камеры
  let img = video.get();
  
  // Применяем эффекты к изображению
  push();
  translate(width - previewWidth - previewMargin, previewMargin);
  
  // Фон для превью
  noFill();
  stroke(255, 30);
  rect(-5, -5, previewWidth + 10, previewHeight + 10, 10);
  
  // Применяем стилизацию
  drawingContext.globalCompositeOperation = 'screen';
  tint(255, 150); // Прозрачность
  image(img, 0, 0, previewWidth, previewHeight);
  
  // Добавляем глитч-эффект
  if (random() < 0.1) {
    let glitchX = random(previewWidth);
    let glitchY = random(previewHeight);
    let glitchW = random(20, 50);
    let glitchH = random(2, 5);
    let sourceY = random(previewHeight);
    copy(img, 
         glitchX, sourceY, glitchW, glitchH,
         glitchX, glitchY, glitchW, glitchH);
  }
  
  // Добавляем шум
  loadPixels();
  for (let i = 0; i < pixels.length; i += 4) {
    if (random() < 0.05) {
      pixels[i] = pixels[i] + random(-20, 20);
      pixels[i+1] = pixels[i+1] + random(-20, 20);
      pixels[i+2] = pixels[i+2] + random(-20, 20);
    }
  }
  updatePixels();
  
  // Рисуем рамку с свечением
  drawingContext.shadowBlur = 10;
  drawingContext.shadowColor = 'rgba(255, 255, 255, 0.5)';
  noFill();
  stroke(255, 50);
  rect(0, 0, previewWidth, previewHeight);
  
  pop();
  
  // Визуализация распознавания руки
  if (predictions.length > 0) {
    push();
    translate(width - previewWidth - previewMargin, previewMargin);
    scale(previewWidth/640, previewHeight/480);
    
    noFill();
    stroke(255, 100);
    // Соединения между пальцами
    for(let i = 0; i < 4; i++) {
      let finger1 = predictions[0].landmarks[4 + i * 4];
      let finger2 = predictions[0].landmarks[4 + (i + 1) * 4];
      line(finger1[0], finger1[1], finger2[0], finger2[1]);
    }
    
    // Индикатор энергии жеста
    circle(handX, handY, 20 + gestureEnergy * 10);
    pop();
  }
  pop();
}

function windowResized() {
  // Пересчитываем размеры для формата Reels
  let w = windowWidth;
  let h = (windowWidth * 16) / 9;
  if (h > windowHeight) {
    h = windowHeight;
    w = (windowHeight * 9) / 16;
  }
  resizeCanvas(w, h);
  
  particles = [];
  for(let i = 0; i < NUM_PARTICLES; i++) {
    particles.push({
      x: random(width),
      y: random(height),
      size: random(1, 3),
      speed: random(0.5, 2),
      angle: random(TWO_PI),
      phase: random(TWO_PI)
    });
  }
}
