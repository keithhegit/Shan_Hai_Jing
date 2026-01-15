uniform float uTime;
uniform vec3 uColorStart;
uniform vec3 uColorEnd;

varying vec2 vUv;

// 伪随机函数
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 2D 噪声
float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a) * u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}

// FBM 噪声
float fbm(vec2 st) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    // 旋转矩阵
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
    for (int i = 0; i < 5; ++i) {
        v += a * noise(st);
        st = rot * st * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

void main() {
    // 居中 UV
    vec2 centeredUv = vUv - 0.5;
    float dist = length(centeredUv);

    // 漩涡效果
    float angle = atan(centeredUv.y, centeredUv.x);
    float radius = length(centeredUv);
    
    // 动态旋转
    float spin = uTime * 0.5;
    float spiral = angle + spin - radius * 5.0; // 螺旋因子

    // 使用 FBM 生成纹理
    vec2 noiseUv = vec2(cos(spiral), sin(spiral)) * radius * 2.0;
    // 添加时间偏移让纹理向中心流动
    noiseUv -= uTime * 0.2; 
    
    float n = fbm(noiseUv * 3.0 + uTime * 0.1);

    // 混合颜色
    vec3 color = mix(uColorStart, uColorEnd, n);

    // 边缘发光 (Fresnel-like) 与中心黑洞
    // 越靠近中心越黑，边缘发光
    float alpha = smoothstep(0.5, 0.4, dist); // 圆形裁切
    
    // 叠加噪声强度
    color += n * 0.5;

    // 中心暗核
    float core = 1.0 - smoothstep(0.0, 0.2, dist);
    color = mix(color, vec3(0.0), core * 0.8);

    gl_FragColor = vec4(color, alpha);
}
