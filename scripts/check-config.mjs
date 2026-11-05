const required=['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID','VITE_STUDIO_ID']
const missing=required.filter(key=>!process.env[key]?.trim())
if(missing.length){console.error('GitHub Actions secrets/variables eksik: '+missing.join(', '));process.exit(1)}
if(process.env.VITE_FIREBASE_PROJECT_ID.startsWith('demo-')||process.env.VITE_USE_EMULATORS==='true'){console.error('Emülatör yapılandırması üretime dağıtılamaz.');process.exit(1)}
if(!/^\/[A-Za-z0-9_./-]*\/$/.test(process.env.VITE_BASE_PATH||'/')&&process.env.VITE_BASE_PATH!=='/'){console.error('VITE_BASE_PATH /REPOSITORY/ veya / olmalı.');process.exit(1)}
