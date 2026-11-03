// Supabase の接続情報。Publishable (anon) Key のみを書くこと。サービスロールキー等の秘密鍵は絶対に書かない。
window.ZERO_CONFIG = {
  supabaseUrl: '',          // 例: https://xxxx.supabase.co
  supabaseKey: '',          // Project Settings > API > anon / publishable key
  // ZeroStudio から作品を受け取ってよい送信元（オリジン）。
  //   []（空）  … Zero と同じオリジンだけを許可（Zero と ZeroStudio を同じ GitHub Pages に置く構成。既定）
  //   別の GitHub Pages に置く場合は ZeroStudio の公開URLを書く。パスが付いていてもオリジンに正規化される。
  //   例: ['https://studio-user.github.io']  /  ['https://you.github.io/zerostudio/']
  //   '*' や https 以外（localhost を除く）は無効として無視される。
  studioOrigins: []
};
