// index.js  ملف علشان يجيب بيانات ال API
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // v2
const rateLimit = require('express-rate-limit'); // optional but recommended

const app = express();
app.use(cors());
app.use(express.json());

// إعداد rate limit بسيط لمنع إساءة الاستخدام
const limiter = rateLimit({
  windowMs: 60 * 1000, // دقيقة
  max: 30,             // 30 طلب لكل IP بالنافذة
  message: { success:false, message: 'Too many requests, slow down.' }
});
app.use(limiter);

// ضع هنا رابط الـ upstream API الخارجي (بدّل إن احتجت)
const UPSTREAM_BASE = process.env.UPSTREAM_BASE || 'http://93.177.64.145:9557/pair/';

// small helper to validate phone-like input (numbers only, length check)
function cleanNumber(input){
  if(!input) return null;
  const n = String(input).replace(/\D/g,'');
  if(n.length < 6 || n.length > 20) return null;
  return n;
}

// Proxy endpoint: ينادي على API الخارجي ويعيد النتيجة كما هي أو بصيغة موحّدة
app.get('/pair/:number', async (req, res) => {
  try {
    const raw = req.params.number || '';
    const number = cleanNumber(raw);
    if(!number) return res.status(400).json({ success:false, message:'invalid number' });

    // بناء رابط الــ upstream (تأكد إنه لا يوجد // مكرر)
    const upstreamUrl = UPSTREAM_BASE.replace(/\/+$/,'') + '/' + encodeURIComponent(number);

    // خيارات fetch: مهلة و headers
    const controller = new AbortController();
    const timeout = setTimeout(()=> controller.abort(), 15000); // 15s timeout

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeout);

    // لو استجابة نصّية (HTML) أو غير JSON، نحتفظ بالخطأ
    const text = await upstreamRes.text();
    try {
      const json = JSON.parse(text);
      // إعادة النتيجة كما وردت من الـ upstream مع حقل proxy=true
      return res.status(upstreamRes.status).json(Object.assign({}, json, { proxy: true }));
    } catch (e){
      // غير JSON -> أعد النص الخام (أحيانًا الـ upstream يعيد HTML أو خطأ)
      return res.status(502).json({ success:false, message: 'Upstream returned non-JSON', raw: text.substring(0,200) });
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ success:false, message: 'Upstream timeout' });
    }
    console.error('proxy error:', err);
    return res.status(500).json({ success:false, message: 'Proxy internal error', error: String(err) });
  }
});

// root
app.get('/', (req,res) => res.send('MONTE Pair Proxy is running'));

// start
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`Pair proxy listening 
on ${PORT}`));

// تـم الـ ََتـطويـر بـواسـطة 𝑴𝑶𝑵𝑻𝑬 🐦‍⬛🌹