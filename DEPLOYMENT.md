# Dağıtım

## GitHub Pages

`HashRouter` sayesinde `/REPOSITORY/#/reports` gibi doğrudan bağlantılar ve yenileme çalışır. Vite base path `VITE_BASE_PATH` ile verilir. Actions varsayılanı `/<repository-name>/`; kullanıcı/organizasyon kök sitesi veya özel alan adında `/` ayarlayın. Bu davranış [Vite'ın resmî statik dağıtım yönergesine](https://vite.dev/guide/static-deploy) uygundur.

`.github/workflows/deploy.yml`:

1. Push main, pull request veya manuel çalıştırma.
2. Node 24 ve Java 21 kurar, npm ci çalıştırır.
3. ESLint, TypeScript, birim/UI, gerçek emulator kural/entegrasyon testleri, production dependency audit, yapılandırmasız doğrulama derlemesi.
4. Main dağıtımında gerekli secrets/variables doğrulanır; demo emulator projesi reddedilir; gerçek public Firebase ayarlarıyla üretim yeniden derlenir.
5. Resmî upload-pages-artifact ve deploy-pages action'ları kullanılır. Personal access token gerekmez. Yalnız deploy job'unda pages:write ve id-token:write vardır.
6. Pull request doğrular; üretime dağıtmaz. Firebase Rules/Index deploy bu pipeline'dan yapılmaz.

Kaynak klasöründe henüz Git deposu veya remote bulunmadığı için commit/push/Pages etkinleştirmesi yapılmamıştır. Kullanıcı kendi GitHub deposunu oluşturmalı, dosyaları gözden geçirip yüklemeli ve Pages Source=GitHub Actions seçmelidir. Depo planının Pages'i desteklemesi gerekir. [GitHub'ın Pages kaynak yapılandırması](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Repository variables

Settings → Secrets and variables → Actions → Secrets → New repository secret (iş akışı aynı adı Variables sekmesinden de okuyabilir):

| Ad                        | Değer                                                         |
| ------------------------- | ------------------------------------------------------------- |
| VITE_FIREBASE_API_KEY     | Firebase web config apiKey                                    |
| VITE_FIREBASE_AUTH_DOMAIN | Firebase web config authDomain                                |
| VITE_FIREBASE_PROJECT_ID  | Firebase web config projectId                                 |
| VITE_FIREBASE_APP_ID      | Firebase web config appId                                     |
| VITE_STUDIO_ID            | Elle belirlediğiniz sabit stüdyo ID'si; yetki belgesiyle aynı |
| VITE_BASE_PATH            | `/REPOSITORY/` veya kök/özel domainde `/`                     |
| VITE_RECAPTCHA_SITE_KEY   | İsteğe bağlı public reCAPTCHA v3 key                          |

Storage bucket ve messagingSenderId kullanılmaz. Özel anahtar gerekmez. VITE değişkenleri browser'da herkese açık olur. Üretim deploy'unda emülatör değişkenini etkinleştirmeyin.

## Firebase deploy

Projenin kök klasöründe:

```sh
npx firebase login
npx firebase projects:list
npx firebase deploy --only firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
```

`YOUR_FIREBASE_PROJECT_ID` gerçek ID ile değiştirilecek yer tutucudur. `firebase init` tekrar çalıştırıp mevcut güvenlik dosyalarını varsayılan açık kurallarla değiştirmeyin. Deploy önceki kuralları değiştirir; bu dosyanın hedef proje için doğru olduğundan emin olun. [Resmî güvenlik kuralları dağıtımı](https://firebase.google.com/docs/firestore/security/get-started).

İlk ADMIN yalnız Console veya güvenilir Admin SDK ile sağlanır; yönergeler SETUP_GUIDE_TR.md içinde. Auth authorized domains'e `USERNAME.github.io` eklenir; repo yolu domain alanına girilmez. Özel domain de ayrıca eklenir.

## Üretim kabulü

Yetkili ve yetkisiz Google hesaplarını ayrı oturumlarda deneyin. Yenileme sonrası tekrar giriş beklenir. Yeni kategori/uygulama/hesap, gelir tahakkuku, tahsilat, gider, transfer, borç ve altın kısmi ödeme deneyin. Geçmiş/rapor/nakit ayrımını doğrulayın. Gerçek finansal veri eklemeden önce küçük doğrulama kayıtlarını nasıl yöneteceğinizi belirleyin; canlı veriye karışacak örnek finansal kayıtlar eklemeyin. Ayrı test Firebase projesi kullanılması uygundur.

GitHub Pages dağıtımı statik dosyaları herkese açık sunar; finansal bilgi derleme içine gömülmez ve Firestore kurallarıyla özel kalır. Özel HTTP güvenlik başlıkları bu Pages iş akışında ayarlanmaz. Daha ileri CSP/header veya kurumsal erişim gereksinimi varsa uygun edge/hosting katmanı ayrıca tasarlanmalıdır.
