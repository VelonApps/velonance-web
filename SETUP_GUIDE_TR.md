# Velonance — Türkçe kurulum rehberi

Bu rehber gerçek üretim hizmetlerini **sizin hesabınızda** etkinleştirmek içindir. Proje kodu hazırdır; Firebase hesabı/projesi, yetkili e-posta, GitHub deposu ve üretim alan adı bu çalışma sırasında oluşturulmadı. Buradaki `YOUR_FIREBASE_PROJECT_ID`, `STUDIO_ID`, `GOOGLE_UID`, `USERNAME` ve `REPOSITORY` açık yer tutuculardır; aynen kopyalanmamalıdır.

## 1. Yerel ortamı hazırlayın

Proje klasörünü terminalde açın. Node 24 LTS ve npm kurulu olsun. Node 22.22.2 ile yerel kontroller de geçmiştir; Node 24 önerilir. Güvenlik testleri için Java 21 kurun ve `java -version` çıktısını doğrulayın.

```sh
npm ci
npm run check
npm run test:rules
```

Beklenen: lint, TypeScript, birim/arayüz, derleme ve emülatör testleri başarılı. Java eksikse `JAVA_HOME` doğru kurulum klasörüne işaret etmeli. Testler demo projeleri kullanır; üretim hesabı gerekmez.

## 2. Firebase projesi oluşturun

[Firebase Console](https://console.firebase.google.com/) adresinde doğru Google hesabıyla oturum açın → **Add project / Proje ekle**. Stüdyonuzun proje adını girin; Google'ın oluşturduğu benzersiz **Project ID** değerini not edin. Bu ID, şirketin görünen adından farklı olabilir. Analytics bu uygulamada kullanılmıyor; isteğe bağlı adımı kapalı bırakabilirsiniz.

Başlangıçta Spark planıyla ilerleyin. Bu kod Cloud Functions/Storage/banka API'si gerektirmez; ücretli backend eklenmemiştir. Kota ve plan uygunluğunu kendi Console'unuzda kontrol edin.

Doğrulama: Project Overview ekranı açılmalı; Project settings → General bölümünde not ettiğiniz Project ID görünmeli.

## 3. Web uygulamasını kaydedin

Project Overview → web simgesi **</>** veya Project settings → General → **Your apps → Add app → Web**. Uygulama takma adı olarak kendi proje adınızı girin. Firebase Hosting kullanmıyoruz; Hosting seçeneğini etkinleştirmeniz gerekmez.

**Register app** sonrasında SDK configuration bölümünde `firebaseConfig` nesnesini görüntüleyin. Şu dört değeri alın: `apiKey`, `authDomain`, `projectId`, `appId`. Özel sunucu anahtarı indirmeyin.

Doğrulama: Your apps listesinde web uygulaması ve App ID görünmeli.

## 4. Google Authentication sağlayıcısını etkinleştirin

Console → **Authentication → Get started → Sign-in method / Sign-in providers → Google**. Enable seçeneğini açın, istenen proje destek e-postasını kendi hesabınızdan seçin → Save.

Email/password veya herkese açık uygulama kayıt sayfası kurmayın. Google oturumu açabilen herkes finansal veriye erişemez; erişim ayrıca UID belgesiyle verilecektir. [Resmî Google giriş belgesi](https://firebase.google.com/docs/auth/web/google-signin).

Doğrulama: Google satırı Enabled görünmeli. Kullanıcı listesi ilk girişe kadar boş olabilir.

## 5. Yetkili alan adlarını ekleyin

Authentication → **Settings → Authorized domains → Add domain**:

- Üretim Pages alan adı: `USERNAME.github.io`. Buraya `https://`, repo yolu veya `/#/` yazmayın.
- Özel alan adı kullanacaksanız o tam hostname'i ayrıca ekleyin.
- Yerel geliştirme için `localhost` ve uygulamayı `127.0.0.1` üzerinden açıyorsanız `127.0.0.1` değerini ekleyin. Gerçek üretim projesine yerel erişim istemiyorsanız ayrı geliştirme projesi kullanın.

Yeni projelerde localhost otomatik yetkili olmayabilir. [Firebase alan adı açıklaması](https://firebase.google.com/docs/auth/faq-and-troubleshooting).

Doğrulama: tam hostname listede görünmeli. `auth/unauthorized-domain` hatası almamalısınız.

## 6. Firestore veritabanını oluşturun

Console → **Databases & Storage / Build → Firestore Database → Create database**. **Standard edition**, `(default)` veritabanı ve Native Firestore kullanın. Uygun konumu kullanıcı/veri yerleşimi gereksinimlerinize göre seçin; bu seçim sonradan kolayca değiştirilemeyebilir. Uygulama belirli bir bölge adı dayatmaz.

Başlangıç güvenliğini **Production mode** olarak seçin. Test mode ile herkese açık finansal veritabanı oluşturmayın. [Resmî Firestore başlangıç akışı](https://firebase.google.com/docs/firestore/quickstart).

Doğrulama: Data / Rules / Indexes sekmeleri görünmeli; ilk kurallar erişimi kapatmalı.

## 7. Projenin güvenlik kurallarını dağıtın

Terminalde bu projenin kök klasöründe:

```sh
npx firebase login
npx firebase projects:list
npx firebase deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

`YOUR_FIREBASE_PROJECT_ID` yerine 2. adımda aldığınız gerçek ID'yi girin. CLI girişinde doğru Google hesabını seçin. Kullanıcı onayı veya OAuth girişi gerekirse kendiniz tamamlayın. `firebase init` mevcut dosyaları yeniden yazabileceği için gerekli değildir.

Doğrulama: CLI başarı mesajı vermeli. Console → Firestore → Rules içinde bu deponun `firestore.rules` içeriği görünmeli. `allow read, write: if true` veya genel `request.auth != null` gibi açık erişim kuralları olmamalı. Kural yayılımı kısa süre alabilir. [Kuralları deploy etme](https://firebase.google.com/docs/firestore/security/get-started).

## 8. İndeksleri dağıtın

```sh
npx firebase deploy --only firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
```

Console → Firestore → Indexes / Composite indexes. Dosyadaki dokuz indeksin (beş `transactions`, dört `auditLogs`) oluşturulup Enabled durumuna gelmesini bekleyin.

Doğrulama: Dashboard tarih sorguları, hesap toplamaları, hesap ekstresi, nakit akışı ve Kayıtlar filtreleri “requires an index” hatası vermemeli. Emülatörün geçmesi üretim indekslerinin oluştuğu anlamına gelmez.

## 9. Yerel public yapılandırmayı girin

```sh
cp .env.example .env.local
```

`.env.local` dosyasını editörde açın; kendi değerlerinizi girin:

| Değişken                  | Nereden alınır                                                               |
| ------------------------- | ---------------------------------------------------------------------------- |
| VITE_FIREBASE_API_KEY     | Web config → apiKey                                                          |
| VITE_FIREBASE_AUTH_DOMAIN | Web config → authDomain                                                      |
| VITE_FIREBASE_PROJECT_ID  | Web config → projectId                                                       |
| VITE_FIREBASE_APP_ID      | Web config → appId                                                           |
| VITE_STUDIO_ID            | Sizin seçeceğiniz sabit, sade kimlik; harf/rakam/tire/alt çizgi, `/` içermez |

Yerel geliştirmede `VITE_BASE_PATH=/`, `VITE_USE_EMULATORS=false`. App Check kurulmadan `VITE_RECAPTCHA_SITE_KEY` boş kalır.

Stüdyo ID'si bir sır değildir. Yetki belgesindeki `studioId` ile birebir aynı olmalıdır; sonradan değiştirmek başka bir tenant'a geçmek anlamına gelir.

Bu değerler browser'da görünür. Admin SDK private key, service account JSON veya özel API key kesinlikle yazmayın. `.env.local` Git tarafından yok sayılır.

```sh
npm run dev
```

Doğrulama: terminaldeki Local URL'yi açın. Kurulum kartı yerine **Google ile Giriş Yap** düğmesi görünmeli. Env değişikliğinden sonra gerekirse dev server'ı yeniden başlatın.

## 10. İlk Google girişini yapıp gerçek UID'yi alın

Uygulamada Google düğmesine tıklayın ve yönetici olacak gerçek hesabınızı seçin. İlk girişte “erişim yetkisi yok” mesajı **beklenen güvenli sonuçtur**.

UID ekranda oturum hesabının altında gösterilir. Alternatif: Firebase Console → Authentication → Users → kendi e-posta satırınızı açın → User UID değerini kopyalayın.

Doğrulama: Authentication kullanıcı listesinde doğru e-posta ve Google sağlayıcısı görünmeli. Henüz dashboard veya Firestore finansal verisi açılmamalı.

## 11. İlk ADMIN kaydını güvenli oluşturun

Firebase Console → Firestore → Data → **Start collection**:

- Collection ID: `authorizedUsers`.
- Document ID: 10. adımda kopyaladığınız **gerçek Google UID**. Auto-ID kullanmayın.

Alanları ekleyin:

| Alan      | Firestore türü | Girilecek değer                                        |
| --------- | -------------- | ------------------------------------------------------ |
| uid       | string         | Document ID ile aynı gerçek UID                        |
| email     | string         | Authentication listesinde görünen tam Google e-postası |
| studioId  | string         | `.env.local` içindeki VITE_STUDIO_ID ile aynı          |
| role      | string         | `ADMIN` (büyük harf)                                   |
| active    | boolean        | `true` (string değil)                                  |
| createdAt | timestamp      | Oluşturduğunuz zaman                                   |
| updatedAt | timestamp      | Oluşturduğunuz zaman                                   |

Save. Bu işlem Console'unuzun yönetici IAM erişimiyle yapılır; browser uygulamasına kendisini yetkilendirme izni verilmez. `owner@example.com` gibi örnek adresleri kullanmayın. Service account anahtarı üretmek/indirmek gerekmez.

Doğrulama: uygulamadaki açık yetki dinleyicisi yeni belgeyi görerek dashboard'a geçmeli. Gerekirse çıkış/giriş yapın. Boş durumlar ve sıfır özetler görünmeli; hayalî finansal kayıt görünmemeli.

## 12. Yerel temel kayıt akışını kontrol edin

Üretim verisine karıştırmadan ayrı test projesinde deneyin:

1. Ayarlar → Kategoriler → varsayılanları ekleyin veya kendi kategorinizi oluşturun.
2. Uygulamalar → gerçek uygulamalarınızı ekleyin.
3. Hesaplar → para birimi ve doğru açılış bakiyesi/tarihiyle hesap oluşturun. Açılış alanları daha sonra kilitlenir.
4. Gelir → bekleyen tahakkuk kaydedin. Dashboard geliri artsın; nakit bakiye değişmesin.
5. Aynı geliri düzenleyip tahsil edildi yapın; hesap ve gerçek ödeme günü seçin. Nakit artsın, gelir ikinci kez sayılmasın.
6. Gider, transfer, borç veya altın kısmi ödeme akışını ilgili modülde doğrulayın.

Doğrulama: Console → `studios/STUDIO_ID` alt koleksiyonlarında belgeler oluşmalı. Yeniden girişte kalıcı kayıtlar geri gelmeli.

## 13. GitHub deposunu oluşturun ve kodu yükleyin

GitHub'da kendi hesabınızda **New repository**. Ücretsiz GitHub planında Pages yalnız **public** depoda çalışır. Private depo için GitHub Pro gerekir; site adresi yine herkese açık olur. Her iki durumda da finansal veri depoda veya sitede değil, Firestore'dadır ve kurallarla korunur. Üretim finans dosyası veya `.env.local` yüklemeyin. Bu klasör başlangıçta Git deposu değildi; dosyalar sizin incelemeniz sonrası ilk kez yüklenmelidir.

Git komutlarıyla yükleyecekseniz kendi repo URL'nizi kullanın; bu rehber sizin adınıza remote eklemez veya push yapmaz. Commit öncesi `.gitignore` ve dosya listesini kontrol edin. `node_modules`, `dist`, `.env.local` ve service account dosyaları dahil edilmemeli. `package-lock.json` dahil edilmeli.

Doğrulama: GitHub'da kaynak kod, `.github/workflows/deploy.yml`, `firestore.rules` ve belgeler görünmeli; gerçek sır içeren dosya görünmemeli.

## 14. GitHub repository secrets ekleyin

Depo → **Settings → Secrets and variables → Actions → Secrets → New repository secret**. 9. adımdaki beş zorunlu VITE değişkenini aynı isimlerle ekleyin.

`VITE_BASE_PATH` (genelde gerekmez; iş akışı repo adından üretir. Gerekirse **Variables** sekmesine ekleyin):

- `https://USERNAME.github.io/REPOSITORY/` için `/REPOSITORY/`.
- `USERNAME.github.io` adlı kök depo veya özel alan adı için `/`.

Repo adının büyük/küçük harfini aynen koruyun. Base verilmezse workflow repo adını kullanır. App Check kurulmuşsa public `VITE_RECAPTCHA_SITE_KEY` ayrıca eklenebilir.

Secrets sayesinde değerler kaynak koda girmez ve Actions loglarında maskelenir. Ancak tarayıcıda çalıştıkları için derlenmiş JS dosyasından okunabilirler; Firebase web yapılandırması bu şekilde çalışacak biçimde tasarlanmıştır. Asıl koruma Firestore kuralları ve yetki belgesidir.

Doğrulama: isimler listede görünmeli. Hiçbir service account/private API key bulunmamalı.

## 15. API anahtarını kısıtlayın

[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → üstten Firebase projenizi seçin → **API keys** altında **Browser key (auto created by Firebase)** satırını açın.

- **Application restrictions → Websites**: `https://USERNAME.github.io/*`, `https://YOUR_FIREBASE_PROJECT_ID.firebaseapp.com/*` ve yerelde çalışacaksanız `http://localhost:*`, `http://127.0.0.1:*`.
- **API restrictions → Restrict key**: Identity Toolkit API, Token Service API, Cloud Firestore API.

Doğrulama: Save sonrası birkaç dakika bekleyip üretimde Google girişini deneyin. Giriş `API key not valid` veya `referer` hatası verirse izin listesini kontrol edin.

## 15b. GitHub Pages'i etkinleştirin

Depo → **Settings → Pages → Build and deployment → Source → GitHub Actions**. Depo planınızın Pages'i desteklediğini kontrol edin. Özel domain kullanmıyorsanız Custom domain boş kalır.

Doğrulama: Pages ekranı Actions ile dağıtım beklediğini belirtmeli. [Resmî Pages yapılandırması](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## 16. Actions dağıtımını çalıştırın

Depo → **Actions → Validate and deploy Velonance → Run workflow → main**. Alternatif olarak main'e kod gönderimi tetikler. Pull request yalnız doğrulama yapar, dağıtmaz.

İşler: `validate` → `build` → `deploy`. İlk iş lint, TypeScript, testler, Firestore Emulator, üretim dependency audit ve build çalıştırır. İkinci iş gerçek public config'i doğrular ve yeniden derler. Son iş Pages artifact'ını dağıtır.

Doğrulama: bütün işler yeşil; deploy adımında URL görünmeli. Başarısız adımı açıp hata metnini inceleyin; test atlayarak yayınlamayın.

## 17. Üretim URL'sini ve girişini doğrulayın

Actions deploy URL'sini açın. Örüntü `https://USERNAME.github.io/REPOSITORY/`. `/#/reports` gibi bir linke gidip sayfayı yenileyin; 404 olmamalı. Google girişini yapın. Üretim hostname'inin 5. adımda ekli olduğunu doğrulayın.

OAuth tarafında `redirect_uri_mismatch` çıkarsa Firebase'in verdiği `authDomain` değerini değiştirmediğinizi kontrol edin. Google Cloud → APIs & Services → Credentials → Firebase'in kullandığı OAuth web client kaydında redirect URI, Firebase auth domain'in `https://AUTH_DOMAIN/__/auth/handler` adresiyle uyumlu olmalıdır. Mevcut Firebase tarafından oluşturulan client kaydını kullanın; rastgele yeni client ID veya GitHub Pages callback yolu üretmeyin. OAuth consent ekranı test kullanıcıları/kurum kısıtlaması gerektiriyorsa gerçek hesaplarınız için Google Cloud ayarlarını tamamlayın.

Doğrulama: Google popup kapanır, doğru kullanıcı dashboard'a erişir. Oturum bu tarayıcıda 5 gün açık kalır; sonra yeniden Google girişi istenir. Ortak bilgisayarda işin bitince çıkış yap.

## 18. Yetkisiz hesabı ve VIEWER rolünü deneyin

Çıkış yapın. Gizli pencere/ayrı profil veya hesap seçiciyle allowlist'te bulunmayan **kendi test Google hesabınızla** giriş yapın. Google girişi başarılı olsa bile finansal ekranlar açılmamalı. Finansal erişim vermek istemediğiniz hesabın yetki belgesini oluşturmayın.

VIEWER testi için kendi test hesabınızın gerçek UID'siyle aynı yapıdaki belgeyi Console'dan `role=VIEWER` olarak oluşturun. Bu hesap okuyabilmeli, oluşturma/düzenleme/iptal butonlarını görmemeli; doğrudan SDK yazmaları da kurallarca reddedilmeli. Test sonrası `active=false` yapın veya erişim bakım politikanıza göre kaldırın.

Yönetici hesabıyla **Kayıtlar → Yetkisiz denemeler** sekmesinde test hesabınız görünmeli; VIEWER hesabının menüsünde **Kayıtlar** olmamalı.

Doğrulama: anonim/yetkisiz/VIEWER yazmaları emülatörde de kapsanır. UI düğmesinin olmaması tek başına güvenlik testi sayılmaz.

## 19. Kalıcılık, güvenlik ve yedek doğrulaması

Yetkili hesapla kendi test projenizde kayıt oluşturun, çıkın ve tekrar girin. Firestore belgesinin kalıcı olduğunu ve tarihsel kurun yeni fiyat girince değişmediğini kontrol edin. Başka stüdyoya ait UID'nin verilerinize ulaşmadığını emülatör testlerinde doğrulayın.

Firestore Rules Playground kullanacaksanız tam belge yolu ve doğru auth claims ile deneyin; Playground sonuçlarını gerçek Google provider/verified-email token kontrolünün yerine koymayın. `npm run test:rules` gerçek SDK okuma/yazmalarını roller ve çapraz tenant senaryolarıyla denetler.

Ayarlar → Veri yönetimi → JSON yedeği alın. Dosyayı hassas veri olarak saklayın. İçe aktarımın tam arşiv restore'u olmadığını, yalnız desteklenen create-only kayıtları aldığını unutmayın. Yanlış kaydı temizlemek için güvenlik kurallarını açmayın; iptal ve geri alma düğmelerini kullanın. Spark planında otomatik Firestore yedeği yoktur: ayda bir JSON yedeği almayı alışkanlık edin.

Doğrulama: yetkisiz istek permission-denied; yönetici kayıtları doğru tenant altında; aynı transfer/ödeme tekrar kaydedildiğinde yinelenen işlem yok; CSV'de formül içeren metin apostrofla güvenli.

## 20. Sorun giderme

| Belirti                             | Kontrol / çözüm                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Kurulum kartı görünüyor             | Beş zorunlu VITE alanı, doğru `.env.local`, dev server yeniden başlatma veya Actions Variables + yeni deploy |
| auth/unauthorized-domain            | Authentication → Settings → Authorized domains; yalnız hostname                                              |
| Popup blocked / kapandı             | Açılır pencereye izin verin; Google düğmesini tekrar kullanın                                                |
| Google başarılı ama erişim yok      | Doğru UID belge ID'si, uid alanı, tam e-posta, active boolean, ADMIN/VIEWER, studioId eşleşmesi              |
| permission-denied                   | Kuralların doğru projeye deploy edildiği, geçerli rol ve şema/hesap para birimi kontrolü                     |
| Requires an index                   | `firestore.indexes.json` deploy; Console'da Enabled bekleyin                                                 |
| Boş grafik                          | Seçili tarih aralığı, tahakkuk/ödeme ayrımı; veri yoksa boş görünüm normal                                   |
| Rapor 1.000 sınırı                  | Daha dar dönem seçin; büyük ölçekte sunucu özeti gerekir                                                     |
| Döviz/altın toplamı eksik           | Ayarlar → Döviz ve altın → bugün veya öncesine ait fiyat; özgün birim adıyla aynı                            |
| Hesap açılışı değişmiyor            | Bilerek kilitlidir; işlenmiş defterin açılışını sessizce değiştirmeyin                                       |
| Java bulunamadı                     | Java 21 kurun; `JAVA_HOME`, `java -version`; sonra test:rules                                                |
| Emulator port in use                | 8080/9099 yerel süreçlerini kontrol edin; üretim ayarıyla karıştırmayın                                      |
| Sayfa/asset 404                     | Base path repo adı ve iki slash; Source=Actions; HashRouter URL'si                                           |
| Actions config eksik                | Değerleri Settings → Secrets and variables → Actions altına tam aynı adlarla ekleyin                         |
| 5 günde bir yeniden giriş isteniyor | Kasıtlı güvenlik sınırı; kurallar da 5 günden eski oturumu reddeder                                          |
| Çoklu cihazda eski liste            | Sayfayı/filtreyi yenileyin; finans koleksiyonlarında sürekli listener yok                                    |

## Opsiyonel App Check

Firestore App Check eklemek isterseniz Firebase Console → App Check → web uygulaması → reCAPTCHA v3 provider kaydı. Gerçek alan adlarınızla public site key üretin; secret key'i VITE değişkenine koymayın. Public site key'i yerel/GitHub `VITE_RECAPTCHA_SITE_KEY` alanına ekleyip yeniden derleyin. Önce istek metriklerini izleyip meşru istemcilerin kabul edildiğini doğrulayın; sonra Firestore için enforcement açın. Authentication App Check ayrıca farklı plan/Identity Platform koşullarına tabi olabilir; varsayılan kurulumun parçası değildir.

## Son kontrol listesi

- [ ] Doğru Firebase projectId ve Web App ID.
- [ ] Google sağlayıcısı açık; production hostname yetkili.
- [ ] Firestore Production mode; depo kuralları ve dokuz indeks deploy edildi.
- [ ] Gerçek UID + e-posta + active + studioId + ADMIN belgesi elle sağlandı.
- [ ] Beş Firebase/stüdyo değeri GitHub Secrets'ta.
- [ ] API anahtarı alan adı ve API ile kısıtlandı.
- [ ] Base path doğru; Pages Source=GitHub Actions.
- [ ] validate/build/deploy başarılı.
- [ ] Üretim hash route yenilemesi ve yetkili Google girişi başarılı.
- [ ] Yetkisiz hesap ve VIEWER yazması reddediliyor.
- [ ] Tahakkuk, nakit, anapara, altın ve transfer kontrolleri doğru.
- [ ] Yedek dosyaları özel yerde; private anahtar hiçbir browser config'inde yok.
