# دومينو أونلاين 🎲

لعبة دومينو عربية (بلوك دومينو، 2 ضد 2) أونلاين بالكامل عبر Socket.io، جاهزة للتغليف كتطبيق أندرويد (WebView).

- **المقاعد**: 0 و2 فريق واحد ("أنتم")، 1 و3 الفريق الآخر ("الخصم") - الشريك يجلس مقابلك.
- **القواعد**: مجموعة دومينو كاملة (28 قطعة)، الجولة الأولى يبدأها صاحب الدبل (6-6) وعليه أن يلعبه أولاً. الجولات التالية يبدأها الفريق الفائز بالجولة السابقة.
- **النقاط**: من يُفرّغ يده يأخذ مجموع نقاط الخصم. عند الإغلاق (لا أحد يستطيع اللعب)، الفريق الأقل نقاطاً في يده يأخذ الفرق.
- **الأهداف**: 101 / 121 / 151 / 201 نقطة.
- **الغرف**: عند إنشاء غرفة تُملأ المقاعد الفاضية ببوتات تلعب تلقائياً، ويمكن لأصدقائك الانضمام بالرمز في أي وقت لاستبدال أي بوت.
- **إعادة الاتصال**: إذا انقطع اتصال اللاعب، يتولى البوت اللعب عنه مؤقتاً، وعند إعادة فتح التطبيق يستعيد مقعده تلقائياً (محفوظ في ذاكرة المتصفح).

---

## 1) التشغيل محلياً

يتطلب Node.js 18 أو أحدث.

```bash
npm install
npm start
```

ثم افتح المتصفح على: `http://localhost:3000`

---

## 2) رفع الخادم أونلاين (مجاناً)

الخادم Node.js واحد يقدّم اللعبة (الواجهة + Socket.io) من نفس الرابط، فلا تحتاج خادمين منفصلين.

### الخيار المقترح: Render.com
1. أنشئ حساباً على [render.com](https://render.com) واربطه بمستودع GitHub يحتوي هذا المشروع (أو ارفع الملفات مباشرة).
2. من Dashboard اختر **New → Web Service**.
3. حدد:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
4. بعد النشر ستحصل على رابط مثل:
   `https://your-app-name.onrender.com`
5. هذا هو الرابط الذي ستستخدمه داخل تطبيق الأندرويد (WebView).

> ملاحظات:
> - الخطة المجانية في Render قد "تنام" الخدمة بعد عدم النشاط، وتحتاج بضع ثوانٍ لإعادة التشغيل عند أول طلب.
> - بدائل أخرى تعمل بنفس الطريقة (نفس Build/Start commands): **Railway.app**، **Fly.io**.
> - تأكد أن البورت يُقرأ من `process.env.PORT` (موجود مسبقاً في `server.js`).

---

## 3) تغليف تطبيق أندرويد (WebView)

أنشئ مشروع Android Studio جديد (Empty Views Activity - Java أو Kotlin).

### AndroidManifest.xml
أضف صلاحية الإنترنت:
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

### activity_main.xml
```xml
<?xml version="1.0" encoding="utf-8"?>
<WebView xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/webview"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />
```

### MainActivity.java
```java
package com.stepby.dominoonline;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private static final String GAME_URL = "https://your-app-name.onrender.com";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        WebView webView = findViewById(R.id.webview);
        WebSettings settings = webView.getSettings();

        settings.setJavaScriptEnabled(true);          // ضروري لتشغيل اللعبة
        settings.setDomStorageEnabled(true);           // ضروري لحفظ جلسة اللاعب (localStorage)
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient()); // يفتح الروابط داخل التطبيق بدل المتصفح

        // دعم زر الرجوع في أندرويد للخروج من اللعبة بدل إغلاق التطبيق مباشرة
        webView.loadUrl(GAME_URL);
    }

    @Override
    public void onBackPressed() {
        WebView webView = findViewById(R.id.webview);
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
```

### نقاط مهمة
- **WebSocket**: يعمل تلقائياً مع `setJavaScriptEnabled(true)` بدون أي إعداد إضافي - Socket.io سيستخدم WebSocket أو polling حسب الحاجة.
- **DOM Storage**: لازم تكون مفعّلة (`setDomStorageEnabled(true)`) ليعمل حفظ جلسة الغرفة (رمز الغرفة + التوكن) ويستطيع اللاعب العودة لمقعده بعد إغلاق التطبيق.
- **الاتجاه RTL**: الصفحة مهيأة بالكامل `dir="rtl"`، تعمل بشكل طبيعي داخل WebView.
- **AdMob**: لإضافة بانر إعلاني (كما في مشاريعك السابقة)، يمكنك وضعه أسفل WebView في `activity_main.xml` ضمن LinearLayout عمودي، مع تصغير ارتفاع WebView بمقدار ارتفاع البانر.
- **اسم الحزمة المقترح**: `com.stepby.dominoonline`

---

## 4) هيكل المشروع

```
domino-online/
├── package.json
├── gameEngine.js     # قواعد اللعبة (التوزيع، الحركات الصالحة، التسجيل)
├── server.js         # خادم Express + Socket.io (الغرف، البوتات، إعادة الاتصال)
└── public/
    ├── index.html    # واجهة اللعبة (لوبي + طاولة اللعب)
    ├── style.css      # التصميم (طاولة زمردية بإطار ذهبي)
    └── game.js        # منطق العميل والاتصال
```

---

## 5) أفكار لتطوير لاحق
- مؤقت لكل دور (Turn Timer) مع إنهاء تلقائي عند انتهاء الوقت.
- تأثيرات صوتية عند وضع القطع والفوز/الخسارة.
- ردود فعل سريعة (إيموجي) بين اللاعبين - الحدث `sendEmote` موجود بالخادم وجاهز للربط بالواجهة.
- تسجيل دخول وحفظ سجل المباريات عبر قاعدة بيانات (مثل Supabase).
