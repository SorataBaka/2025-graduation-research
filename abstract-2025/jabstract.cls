% 平成15年度学外卒業研究発表会予稿用クラスファイル
% 平成15年1月29日 作成
% 平成19年11月1日 修正
%   指導教官→指導教員・文字コードを UTF8 へ
% 平成19年11月2日 修正
%   ProvideClass の日付文字列を修正(日を2桁に)
% 平成22年10月21日 修正
%   fancyheadings→fancyhdr
%   \headrulewidth を \renewcommand するように変更
% 平成24年10月24日 修正
%   align* などがうまく扱えないのでタイトルの挿入部を変更
% 令和7年10月3日 修正
%   uplatex と dvipdfmx を使う前提でパッケージ等を修正
%                                          林 裕樹
\NeedsTeXFormat{pLaTeX2e}
\ProvidesClass{jpreprint}[2025/10/03 卒業研究発表会予稿]
\ExecuteOptions{12pt,a4paper}
\ProcessOptions\relax
\LoadClass[]{jsarticle}
\RequirePackage[fleqn]{amsmath}
\RequirePackage[dvipdfmx]{graphicx}
\RequirePackage{times}
\RequirePackage{multicol}
\RequirePackage{titlesec}
\RequirePackage[deluxe]{otf}
\RequirePackage[T1]{fontenc}
\RequirePackage{lmodern}
\RequirePackage{minijs}
\RequirePackage{silence}
\WarningFilter{caption}{Unknown document class (or package)}
\RequirePackage{caption}

%細明朝
\def\textlt#1{\relax\ifmmode\hbox\fi{\rmfamily\ltseries#1}}
%ミディアムゴシック
\def\textmd#1{\relax\ifmmode\hbox\fi{\sffamily\textmg{#1}}}
%太ゴシック
\def\textfg#1{\relax\ifmmode\hbox\fi{\sffamily\bfseries #1}}
%極太ゴシック
\def\texteg#1{\relax\ifmmode\hbox\fi{\sffamily\bfseries\ebseries#1}}

\def\jtitle#1{\def\@jtitle{#1}}
\def\jauthor#1{\def\@jauthor{#1}}
\def\jteacher#1{\def\@jteacher{#1}}
\def\jaffiliation#1{\def\@jaffiliation{#1}}

\newenvironment{tablehere}
  {\def\@captype{table}}
  {}
\newenvironment{figurehere}
  {\def\@captype{figure}}
  {}

\captionsetup{labelsep=colon}

\textwidth 180mm
\textheight 207mm
\oddsidemargin -10mm
\evensidemargin -10mm
\columnsep 10mm
\columnseprule 0pt
\textheight=\paperheight
\advance\textheight -45mm
\headheight=0pt
\topmargin=-1in
\advance\topmargin 12mm

\def\maketitle{%
  \vbox{%
    \hbox to \textwidth{\vtop{\hsize=\textwidth\centering{\textmd{\fontsize{24pt}{26pt}\selectfont\@jtitle}}}}
    \vskip 8pt
    \hbox to \textwidth{\hss\@jauthor (\@jaffiliation)\hss}
    \hbox to \textwidth{\hss 指導教員~~~~\@jteacher\hss}
  }
}

\pagestyle{empty}
