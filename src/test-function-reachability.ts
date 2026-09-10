/**
 * テストファイル内で「定義したが呼んでいないテスト関数」を探す。
 *
 * 2026-09-10 の監査で tests/ 配下475本のうち139本がどのチェーンからも
 * 実行されていなかった。それは glob で全ファイルを回すことで塞いだ。
 *
 * だがファイル単位の対策では **1ファイルの中で定義だけして呼ばない関数**
 * を拾えない。2026-09-11 に実際にそれをやった。書いたアサーションが1つも
 * 走っておらず、変異テストで「検知できない」と出て初めて気づいた。
 *
 * ## 誤検出を出さない側に倒す
 *
 * 最初は「ファイル内の `name(` の出現が1回なら未呼び出し」で書いたが、
 * 文字列・コメントを除去する処理がシングルクォート内の `"` を
 * 遠くの `"` と対にしてしまい、1ファイルから4,615文字を巻き込んで
 * **19件の誤検出**を出した（実際は `main()` の中から呼ばれていた）。
 *
 * 落とすためのチェックで誤検出を出すと、その日から誰も信じなくなる。
 * いまは「行頭が呼び出しに見える行」だけを数える。変わった呼び方をすると
 * 見逃すが、見逃し（死んだテストを1本見落とす）のほうが
 * 誤検出（生きたテストを死んでいると言う）より害が小さい。
 */

export interface UncalledTestFunction {
  file: string;
  name: string;
  line: number;
}

const DECLARATION = /^(?:export\s+)?(?:async\s+)?function\s+(test[A-Za-z0-9_]*)\s*\(/;
const ARROW_DECLARATION = /^(?:export\s+)?const\s+(test[A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|function)/;

/**
 * その行に `name(` が現れるか。
 *
 * **行をまたぐ除去はしない。** 最初の実装は文字列を消そうとして行をまたぎ、
 * 呼び出しごと巻き込んだ。1行だけ見るなら、どれだけ引用符が壊れていても
 * 他の行の呼び出しは消えない。
 *
 * 直前が識別子の一部でないことは見る（`testFoo` が `testFooBar` に誤爆しない）。
 * コメント内の言及を呼び出しと数えてしまうことはあるが、それは
 * 「死んだテストを見逃す」側の誤りなので、落とすチェックとしては安全側。
 */
function lineMentionsCall(line: string, name: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9_$.])${name}\\s*\\(`).test(line);
}

export function findUncalledTestFunctions(input: {
  file: string;
  source: string;
}): UncalledTestFunction[] {
  const lines = input.source.split("\n");
  const declarations: Array<{ name: string; line: number }> = [];
  const seen = new Set<string>();

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trimStart();
    const match = DECLARATION.exec(line) ?? ARROW_DECLARATION.exec(line);
    if (!match) continue;
    const name = match[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    declarations.push({ name, line: index + 1 });
  }

  return declarations
    .filter(({ name, line }) =>
      !lines.some((candidate, index) => index + 1 !== line && lineMentionsCall(candidate, name)))
    .map(({ name, line }) => ({ file: input.file, name, line }));
}
