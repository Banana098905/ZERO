/* ZeroStudio の公開設定（秘密情報は置かないこと）。
 * ZS_ZERO_URL … 「Zeroに公開」で開く Zero の公開URL。
 *   ''（未設定）  … 同じ配信に Zero が同梱されている構成（Studio が <Zero>/zerostudio/ にある）を想定し、'../index.html#/publish' を開く。
 *                   Zero を別の GitHub Pages に置く場合は必ず設定すること（未設定だと Zero が見つからず、10 秒後に「応答なし」と表示される）。
 *   'https://you.github.io/zero/' のように絶対URLを書く（https のみ。localhost は http 可）。末尾に #/publish が無ければ自動で付く。
 * Zero 側の js/config.js の studioOrigins に、この ZeroStudio のオリジンも設定すること。 */
window.ZS_ZERO_URL = '';
