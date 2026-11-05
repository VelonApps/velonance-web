# Güvenlik

## Güven sınırı

Firebase Authentication kimlik doğrular, Firestore Security Rules veri erişimini yetkilendirir. Gizli bir URL, görünmeyen buton veya yalnız frontend e-posta kontrolü güvenlik sınırı değildir.

İzin için bütün koşullar gerekir:

1. Oturum var; sağlayıcı `google.com`; `email_verified=true`.
2. `authorizedUsers/{request.auth.uid}` belgesi var.
3. Belgedeki UID ve e-posta, token UID/e-postasıyla eşleşiyor.
4. Belge aktif; `studioId` istenen tenant ile aynı.
5. Rol `ADMIN` veya `VIEWER`; yazmada `ADMIN`.

Yetki belgesinin sahibi yalnız kendi belgesini okuyabilir. ADMIN kendi stüdyosunun yetki kayıtlarını okuyabilir. **Hiçbir browser istemcisi yetki belgesi oluşturamaz, güncelleyemez veya silemez; ADMIN dahil.** İlk yönetici Firebase Console üzerinden sağlanır. Başka bir Google hesabıyla giriş yapmak kendi başına finansal erişim sağlamaz.

## Veri koruması

- Varsayılan bütün erişimler kapalıdır. Bilinen koleksiyonlara açık rol/tenant koşulları vardır.
- Önemli finansal alanlar, nakit yönleri, kur dönüşümü, hesap para birimi, referanslar, dağılım toplamı, sabit schemaVersion ve oluşturucu metadata'sı kontrol edilir. Ek alanlar reddedilir.
- `createdAt`/`createdBy` değiştirilemez; güncelleme aktörü ve zamanı token/serverTimestamp ile eşleşir.
- Transfer, borç ödemesi ve tekrar oluşumunda bağlı belgeler atomik doğrulanır. Ödeme toplamı anaparayı aşamaz. Çocuk ödeme kimlikleri bir kez oluşturulabilir.
- Finansal belgeler fiziksel silinemez. Bağlı finansal işlemler güncellenemez. Bağımsız gelir/gider iptali nakit etkisini sıfırlar.
- Hesabın açılış bakiyesi/tarihi/para birimi değiştirilemez. Uygulama/hareket referansları fiziksel silinmez.
- Backend yokken güvenli rol yönetimi butonu sunulmaz; Console veya güvenilir Admin SDK gerekir.

Kurallar kötü niyetli bir ADMIN'e karşı tam muhasebe denetimi değildir. ADMIN, yetkili bir iş verisi yazarıdır ve kendi stüdyosunda bağımsız gelir/gider oluşturabilir. Console ve Admin SDK IAM erişimi kuralları atlar; yönetici Google hesabına çok faktörlü doğrulama ve en az IAM yetkisi uygulayın.

## Oturum, önbellek ve tarayıcı

Auth oturumu `inMemoryPersistence`, Firestore `memoryLocalCache`, TanStack Query yalnız RAM kullanır. Sayfa yenilenince yeniden giriş gerekmesi kasıtlıdır. Çıkışta ve yetki değişiminde sorgu önbelleği temizlenir. Tek localStorage verisi `velonance-theme` görünüm tercihidir.

React güvenli metin render'ı kullanılır; `dangerouslySetInnerHTML`, HTML içe aktarımı veya kullanıcı metniyle eval yoktur. Kullanıcı girdileri Zod ile doğrulanır; formlarda ve repository katmanında kontrol edilir. Destructive iptal/arşiv öncesi onay istenir. Finansal veri, token veya form içeriği console'a/analytics'e gönderilmez. Ekler yalnız dosya adı/referans metadatasıdır; Storage upload kodu yoktur.

Yetki belgesi canlı dinlenir. Rol iptali arayüzden erişimi de kaldırır; gerçek sunucu reddi yine kurallardan gelir. Google hesap erişiminin acil iptalinde yetki belgesini `active:false` yapmak ve Firebase Authentication oturum tokenlarını güvenilir yönetici aracından iptal etmek değerlendirilebilir.

## Dışa / içe aktarım

Dışa aktarma yalnız korumalı ekranda başlatılır ve Firestore okumalarıyla aynı kurallara tabidir. VIEWER finansal veriyi okuyabildiği için dosya olarak da dışa aktarabilir. İndirilen dosyanın güvenliği kullanıcının sorumluluğundadır.

CSV hücreleri tırnaklanır, tırnaklar çiftlenir; başında boşluk olsa bile `= + - @`, tab ve satır başı formülleri apostrofla etkisizleştirilir. JSON şema sürümü içerir. İçe aktarım boyut/JSON/şema/tenant/kimlik doğrulaması, önizleme, mevcut kimlikleri atlama, açık checkbox onayı ve kayıt bazlı sonuç raporu kullanır. Dosyadaki kod/HTML çalıştırılmaz. Referanslar önce, bağımsız gelir/gider sonra işlenir. Yeniden kontrol ve transaction içindeki `createOnly`, eşzamanlı importun mevcut kaydı ezmesini engeller.

Tam JSON arşivin tüm bağlı defter kayıtlarını tarayıcıdan geri yazmak desteklenmez; bazı immutable ilişkiler güvenli bir restore servisi gerektirir. İçe aktarma kayıt bazında atomiktir; bütün dosya tek atomik işlem değildir. Hatalı kayıtların listesi korunur.

## Audit sınırı

Repository işlemleri before/after, actorUid, actorEmail ve serverTimestamp içeren audit belgesini aynı transaction'a ekler. Audit ve oturum kayıtlarını yalnız ADMIN okur; kurallar güncellemeyi ve silmeyi reddeder, e-postayı oturum belirteciyle doğrular. Sunucu tarafı olmadığından, doğrudan SDK ile yazan bir ADMIN log eklemeyebilir veya açıklamayı yanlış yazabilir; bu nedenle kayıtlar sunucu tarafından doğrulanmış muhasebe denetim izi değildir.

`accessDenied/{uid}` belgesini, Google ile oturum açmış herhangi bir hesap yalnız kendi UID'si ve kendi e-postasıyla yazabilir; okuyamaz. Hesap başına tek belge olduğu için büyüme sınırlıdır. IP adresi tutulmaz.

## Anahtarlar ve yapılandırma

Firebase web `apiKey`, `authDomain`, `projectId`, `appId` herkese açık istemci tanımlarıdır. `.env.local` Git'e alınmaz, fakat VITE değişkenleri derlemede browser JS'ine gömülür. GitHub Secrets kullanmak bunları browser'da gizli yapmaz. Service account, private API key ve Admin SDK anahtarı hiçbir VITE değişkenine konulamaz.

App Check için yalnız public reCAPTCHA v3 site key desteklenir. App Check önce Console'da kayıt ve trafik izleme ile denenmeli; ardından uygun hizmette enforcement etkinleştirilmelidir. Bu, kullanıcı allowlist'inin yerini almaz. Authentication için App Check enforcement ayrıca Identity Platform gerektirebilir; varsayılan kapsam Firestore korumasıdır. [Resmî Authentication güvenlik açıklaması](https://firebase.google.com/docs/auth/faq-and-troubleshooting).

## Bağımlılık incelemesi

Üretim bağımlılıklarında `npm audit --omit=dev` sıfır açık döndürdü. Firebase CLI geliştirme ağacında Pub/Sub/OpenTelemetry ve gaxios/uuid kaynaklı beş orta seviye uyarı bulunuyor; browser paketine dahil değildir. Kör `npm audit fix --force` önerilmez; eski Firebase CLI sürümüne ana sürüm değişimi yapar. CLI araç zinciri güncellemelerini ayrı test edin. Bilinen bu geliştirme riskleri canlı finans verisiyle CLI işlemlerinde değerlendirilmelidir.

## Bildirim

Güvenlik sorunlarını herkese açık issue'ya hassas veri veya token ekleyerek bildirmeyin. Depo sahibiyle özel kanaldan paylaşın. İlk kurulum tamamlanmadan gerçek finansal veri eklemeyin; yetkili/yetkisiz kullanıcı senaryolarını ve emülatör testlerini doğrulayın.

## Firebase yapılandırması ve GitHub

`VITE_FIREBASE_*` değerleri GitHub Secrets'ta tutulabilir ve kaynak koda girmez, ancak tarayıcıda çalışan pakete gömülür ve sitedeki JS dosyasından okunabilir. Firebase web API anahtarı bu yüzden gizli parola gibi değerlendirilmez; koruma Firestore kuralları ve `authorizedUsers` belgesidir. Anahtarı Google Cloud'da alan adı ve API ile kısıtlayın (kurulum rehberi 15. adım). Service account dosyaları hiçbir zaman depoya veya tarayıcı yapılandırmasına girmez.

## Kural ifade sınırı

Firestore bir kural değerlendirmesinde en fazla 1.000 ifade çalıştırır; aşılırsa yazma `permission-denied` ile reddedilir. `transactionValid` bu nedenle sade tutulur: `tests/rules/repository.test.ts` en ağır senaryoyu (beş uygulamaya dağıtılmış, kategorili, ödenmiş gider) doğrular. Kurala kontrol eklerseniz bu testi çalıştırın. Dağılımdaki uygulama varlığı ve yinelenmemesi istemci işleminde denetlenir; kural biçimi ve %100 toplamını denetler.
