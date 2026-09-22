#!/usr/bin/env python3
"""Render editable bilingual product UI artwork with the app's exported logos.

The supplied design is the layout reference. UI and text remain vectors; logos
are embedded verbatim, without a second tile or inset. No live user data.
"""
import base64
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/screenshots'
INK, SOFT, FAINT, CORAL = '#302e2b', '#817e78', '#aaa59f', '#d9523f'
PATHS = {
    'list': 'M5 3h14v18H5z M5 9h14 M5 15h14',
    'inbox': 'M5 5h14l3 9v5H2v-5z M2 14h6l2 3h4l2-3h6',
    'copies': 'M8 8h13v13H8z M16 4H3v13',
    'books': 'M4 3v18 M9 3v18 M14 4l5 17 M3 6h7',
    'disk': 'M6 5h12l4 10H2z M2 15v5h20v-5 M17 17h2',
    'people': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M5 21v-3c0-6 14-6 14 0v3 M4 4a3 3 0 0 0 0 6 M2 15v5',
    'play': 'M5 3l15 9-15 9z',
    'heart': 'M12 21 3 12C-3 3 8-1 12 6c4-7 15-3 9 6z',
    'spark': 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z M21 1v4 M19 3h4',
    'lock': 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',
    'film': 'M3 3h18v18H3z M7 3v18 M17 3v18 M3 8h4 M3 16h4 M17 8h4 M17 16h4',
    'wave': 'M1 12h5l3-9 4 18 3-9h7',
    'edit': 'M10 4H4v17h16v-9 M10 15l2-5 7-7 3 3-7 7z',
    'person': 'M3 4h18v16H3z M12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M6 20c0-7 12-7 12 0',
    'box': 'M3 3h18v5H3z M5 8v13h14V8 M9 12h6',
    'trash': 'M3 5h18 M8 5V2h8v3 M5 5l1 17h12l1-17 M10 9v9 M14 9v9',
    'shield': 'M12 2l8 3v7c0 5-8 10-8 10S4 17 4 12V5z M8 11l3 3 5-6',
    'key': 'M14 11a5 5 0 1 0-2-4L2 17v5h5v-3h3v-3z',
}

def render(lang):
    zh = lang == 'zh'
    s = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2880" height="2786" viewBox="0 0 1440 1393">',
         '<defs><filter id="shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#423729" flood-opacity=".07"/></filter></defs>']
    def rect(x,y,w,h,fill='#fffdfc',r=14,stroke=None,extra=''):
        s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"'+(f' stroke="{stroke}"' if stroke else '')+f' {extra}/>')
    def txt(x,y,v,size=13,color=INK,weight=500,mono=False,extra=''):
        font = 'Menlo,monospace' if mono else "-apple-system,BlinkMacSystemFont,'Helvetica Neue','PingFang SC',sans-serif"
        s.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="{font}" font-size="{size}" font-weight="{weight}" {extra}>{escape(v)}</text>')
    def icon(name,x,y,size=18,color=SOFT):
        s.append(f'<svg x="{x}" y="{y}" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="{PATHS[name]}"/></svg>')
    def logo(filename,x,y,size=26,opacity=1):
        data=base64.b64encode((OUT/'agent-logos'/f'{filename}.png').read_bytes()).decode()
        s.append(f'<image x="{x}" y="{y}" width="{size}" height="{size}" opacity="{opacity}" xlink:href="data:image/png;base64,{data}"/>')
    def line(x,y,w):
        s.append(f'<path d="M{x} {y}h{w}" stroke="#ede8e2"/>')
    def toggle(x,y,on):
        rect(x,y,36,21,CORAL if on else '#e2dfdc',11)
        s.append(f'<circle cx="{x+(25.5 if on else 10.5)}" cy="{y+10.5}" r="8.5" fill="white"/>')
    def card(x,y,w,h):
        rect(x,y,w,h,stroke='#e8e2dc',extra='filter="url(#shadow)"')
    rect(0,0,1440,1393,'#f7f5f2',12)
    for x,c in [(22,'#ff6059'),(42,'#ffbd2e'),(62,'#28c840')]:
        s.append(f'<circle cx="{x}" cy="22" r="6" fill="{c}"/>')
    rect(95,7,235,29,r=15,stroke='#e6dfd7')
    txt(110,26,'⌕',18);txt(128,25,'搜索影片、人物、标签' if zh else 'Search films, people, tags',12,SOFT)
    rect(608,6,226,32,'#fffdfc',17)
    txt(643,26,'放映 ⌘1' if zh else 'Play ⌘1',12,SOFT,600)
    rect(720,9,110,26,CORAL,14)
    txt(748,26,'工作台 ⌘2' if zh else 'Workbench ⌘2',12,'white',700)
    rect(10,52,212,1328,'#fcfaf8',16,extra='filter="url(#shadow)"')
    groups=[(94,'资料库','LIBRARY',[
        ('list','清单','List','57'),('inbox','收件箱','Inbox','7'),('copies','重复项','Duplicates','0'),('books','合集','Collections','7')]),
        (282,'媒体源','SOURCES',[('disk','本机 · Movies','This Mac · Movies','57')]),
        (362,'视角','VIEWS',[('people','人物','People','20'),('play','观看历史','History','18'),('heart','收藏','Favorites','1')]),
        (515,'位置与工具','TOOLS',[('spark','AI 智能体','AI Agents',''),('lock','私密空间','Private Space','')])]
    for y,cn,en,rows in groups:
        txt(30,y,cn if zh else en,10,FAINT,700,extra='letter-spacing="1"')
        for i,(ic,cn,en,n) in enumerate(rows):
            yy=y+30+i*36
            if ic=='spark':
                rect(20,yy-19,192,33,'#f5e8e3',6);rect(20,yy-19,3,33,CORAL,0)
            icon(ic,32,yy-13,16,CORAL if ic=='spark' else SOFT)
            txt(59,yy,cn if zh else en,13,INK if ic=='spark' else '#655f58',700 if ic=='spark' else 600)
            if n:txt(202,yy,n,11,FAINT,mono=True,extra='text-anchor="end"')
    txt(32,1355,'⚙',18,SOFT);txt(59,1355,'设置' if zh else 'Settings',13,SOFT,600)
    txt(263,85,'AI 智能体' if zh else 'AI Agents',24,INK,800)
    txt(263,112,'让本机的 AI 工具通过受控接口检索影片、读取播放状态并控制播放器。' if zh else 'Let AI tools on this Mac search films, read playback state and control the player.',13,SOFT)
    card(263,136,1137,119)
    rect(281,153,36,36,'#f6e9e4',10);icon('spark',290,162,18,CORAL)
    txt(331,166,'允许 AI 与自动化连接' if zh else 'Allow AI & automation to connect',15,INK,700)
    txt(331,188,'只接受本机连接；AI 工具只能访问你允许的内容。' if zh else 'Local connections only. AI tools can access only what you allow.',12,SOFT)
    toggle(1346,160,True);line(263,207,1137)
    txt(280,235,'●',13,'#328557');txt(295,235,'运行中 · 127.0.0.1:47831' if zh else 'Running · 127.0.0.1:47831',11,SOFT,mono=True)
    icon('shield',470,223,14,'#328557');txt(493,235,'私密空间始终排除在外，即使已解锁' if zh else 'Private Space is always excluded, even when unlocked',12,SOFT)
    txt(1190,235,'····4f2a',11,SOFT,mono=True);rect(1325,216,56,27,r=14,stroke='#e6dfd7');txt(1335,234,'↻ 轮换' if zh else '↻ Rotate',10,SOFT,600)
    txt(264,288,'权限' if zh else 'Permissions',14,INK,700)
    txt(zh and 302 or 357,288,'每条放出的方法写在右侧' if zh else 'Available methods are listed on the right',12,FAINT)
    rows=[
        ('film','读取普通影片库','Read the library','检索影片、人物、标签、合集与文件路径','Search films, people, tags, collections and file paths','library.search · get · facets'),
        ('wave','读取播放状态','Read playback state','当前项目、进度、时长与队列','Current item, position, duration and queue','playback.get · queue.get'),
        ('play','控制播放器','Control the player','打开、播放、暂停、停止、定位、跳转、音量与切换队列','Open, play, pause, stop, seek, skip, volume and queue','playback.open · play · pause · stop · seek · …'),
        ('edit','修改影片资料','Edit film details','收藏、评分、标签、人物、备注与合集；不会移动文件','Favorites, ratings, tags, people, notes and collections','library.set_favorite · update · collections.create · …'),
        ('person','人物识别','People recognition','分析人脸、扫描影片库、确认或忽略识别建议','Analyze faces, scan the library, review suggestions','people.analyze · scan_library · review_apply · …'),
        ('box','归档文件','Archive files','按归档规则把收件箱影片移入影片库，先预览再执行','Move inbox films into your library — preview first','files.archive_preview · archive'),
        ('trash','清理重复项','Clean up duplicates','把多余的重复文件移到废纸篓，不会永久删除','Move extra copies to the Trash; never permanently delete','files.trash_preview · trash')]
    card(263,303,1137,448)
    for i,(ic,cn,en,desc,descen,method) in enumerate(rows):
        y=303+i*64
        if i:line(263,y,1137)
        icon(ic,281,y+23,18);txt(310,y+26,cn if zh else en,14,INK,700)
        txt(310,y+46,desc if zh else descen,12,SOFT)
        txt(1323,y+35,method,11,FAINT,mono=True,extra='text-anchor="end"')
        toggle(1346,y+22,i<3)
    txt(264,782,'连接工具' if zh else 'Connect a tool',14,INK,700)
    txt(zh and 328 or 370,782,'已检测到 4 个 · 都通过同一个本机 MCP 适配器连接' if zh else '4 detected · all through the same local MCP adapter',12,FAINT)
    card(263,797,1137,480);rect(264,798,234,478,'#f8f6f3',13)
    s.append('<path d="M498 798v478" stroke="#e8e2dc"/>')
    txt(280,821,'已检测到 · 4' if zh else 'DETECTED · 4',10,FAINT,700,mono=True)
    clients=[('Claude-Code','Claude Code'),('Codex-ChatGPT','Codex'),('VS-Code','VS Code'),('Gemini-CLI','Gemini CLI'),('Cursor','Cursor'),('Windsurf','Windsurf'),('Qoder','Qoder'),('WorkBuddy','WorkBuddy'),('Kimi-CLI','Kimi CLI'),('Grok','Grok')]
    for i,(file,name) in enumerate(clients):
        y=835+i*40+(34 if i>=4 else 0)
        if i==4:txt(280,y-14,'未检测到 · 6' if zh else 'NOT DETECTED · 6',10,FAINT,700,mono=True)
        if i==0:rect(271,y-2,218,37,stroke='#e8e2dc',r=9,extra='filter="url(#shadow)"')
        logo(file,280,y+4,26,1 if i<4 else .65)
        txt(317,y+23,name,13,INK if i<4 else '#88857f',700 if i==0 else 600)
        if i<4:txt(472,y+23,'●',11,'#328557')
    logo('Claude-Code',520,823,32);txt(564,835,'Claude Code',17,INK,750)
    txt(564,859,'在终端里运行一次，之后每次启动都会自动连上。' if zh else 'Run once in your terminal; it reconnects on every launch.',12,SOFT)
    rect(1298,825,82,26,'#e7f1e9',13);txt(1308,843,'● 已检测到' if zh else '● Detected',11,'#328557',600)
    rect(520,883,860,67,'#f6f4f1',10)
    txt(536,909,'claude mcp add --transport stdio --scope user nsurator --',12,INK,mono=True)
    txt(536,930,"'/Users/demo/Library/Application Support/nsurator-app/agent-runtime/bin/nsurator' mcp serve --client claude",10.5,INK,mono=True)
    rect(520,964,860,45,r=11,stroke='#e6dfd7');icon('key',533,979,15)
    txt(559,991,'使用共享的访问令牌；签发专属令牌后可单独撤销或设为只读。' if zh else 'Uses the shared token. Issue a dedicated one to revoke it or make it read-only.',12,SOFT)
    rect(1260,972,108,28,r=15,stroke='#e6dfd7');txt(1274,991,'签发专属令牌' if zh else 'Issue a token',11,INK,600)
    rect(520,1023,zh and 98 or 136,31,r=16,stroke='#e6dfd7');txt(533,1043,'⧉ 复制命令' if zh else '⧉ Copy command',12,INK,600)
    txt(zh and 1016 or 900,1043,'app 移动或更新后仍然有效。' if zh else 'This path stays valid after moves and updates.',11,FAINT)
    txt(264,1311,'最近活动' if zh else 'Recent activity',14,INK,700)
    txt(zh and 328 or 375,1311,'只记调用和结果，不记返回内容' if zh else 'Logs calls and results, never returned content',12,FAINT)
    card(263,1327,1137,45);logo('Claude-Code',281,1340,20)
    txt(312,1354,'Claude Code',12,INK,650);txt(409,1354,'library.search',11,SOFT,mono=True)
    rect(1300,1340,28,20,'#e7f1e9',10);txt(1308,1354,'ok',10,'#328557',600,mono=True);txt(1345,1354,'10:26',11,FAINT,mono=True)
    s.append('</svg>')
    (OUT/f'ai-agents.{lang}.svg').write_text('\n'.join(s),encoding='utf-8')

if __name__ == '__main__':
    for language in ('zh','en'):
        render(language)
