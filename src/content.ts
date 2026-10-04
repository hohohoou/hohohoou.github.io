import { webImage } from './web-images.ts';
export type Entry = {
  id: string;
  art: string;
  title: string;
  subtitle?: string;
  period?: string;
  place?: string;
  summary?: string;
  bullets?: string[];
  pin?: { image: string; outline: 'chenre' | 'winwin' | 'targetmol' | 'ludlow' | 'gohire' };
};

export type Experience = {
  id: string;
  company: string;
  kind: string;
  title: string;
  accent: string;
  badge: 'school' | 'work' | 'flask' | 'projects' | 'teaching' | 'life' | 'music';
  image: string;
  pinCase?: 'work' | 'projects';
  entries: Entry[];
};

export const contact = { label: "Let's chat", email: 'Jayzhou1314614@gmail.com' };

export const introduction = "I'm hoho—a creator here for winding roads, good games, and turning “what if?” into something real.";

// Public copy selected with hoho. Unselected résumé details and business metrics stay private.
export const experiences: Experience[] = [
  {
    id: 'school', company: '教育', kind: 'LEARNING', title: '关于学习，也关于人',
    accent: '#776191', badge: 'school', image: webImage('/assets/pins/nyu-torch.png'),
    entries: [{ id: 'nyu', art: webImage('/assets/journal/nyu-steinhardt-pencil.png'), title: 'New York University', subtitle: 'Media, Culture, and Communication', period: '2026er', place: '纽约', bullets: [
      '最受益的一门课：Innovation in Marketing。人会变老，能力和状态也会变化；好的产品应该跟得上这些变化，让人始终觉得自己用得来。',
      '一些睡觉宝地：Bobst 十楼靠边沙发、Paulson 四楼沙发、Silver 一楼...',
      '再选一次，你会选building after building还是传统的campus life?',
    ] }],
  },
  {
    id: 'work', company: '实习', kind: 'EXPERIENCE', title: '在不同的地方，做具体的事',
    accent: '#987044', badge: 'work', image: webImage('/assets/pins/work-case-cream.png'), pinCase: 'work',
    entries: [
      { id: 'chenre', pin: { image: webImage('/assets/pins/work-bread.png'), outline: 'chenre' }, art: webImage('/assets/journal/chenre.png'), title: '趁热集合', subtitle: '海外市场实习', place: '上海', bullets: [
        '围绕门店推广，协助策划并落地“一日店长”活动，对接博主、设计互动机制；活动当日营业额较上周同日增长。',
        '完成前厅、后厨与市场岗位轮岗，通过线上、线下考核，熟悉门店运营与营销执行流程。',
      ] },
      { id: 'winwin', pin: { image: webImage('/assets/pins/work-signal.png'), outline: 'winwin' }, art: webImage('/assets/journal/winwin.png'), title: 'Win Win Electrical Power Equipment', subtitle: '海外销售支持实习', place: '拉各斯', bullets: [
        '基于企业财报与行业信息分析尼日利亚通信基建需求，识别混凝土杆供应机会，并开展定向推广。',
        '对接客户与工厂，整理产品规格、交付范围及报价信息，支持供货项目推进。',
      ] },
      { id: 'targetmol', pin: { image: webImage('/assets/pins/work-flask.png'), outline: 'targetmol' }, art: webImage('/assets/journal/targetmol.png'), title: 'TargetMol', subtitle: '市场协调实习', place: '波士顿', bullets: [
        '面向海外科研用户，完成科研与产品内容的策划、英文改写及发布，持续运营 LinkedIn 与官网。',
        '围绕 EACR 展会获客，策划互动并配合多渠道推广，支持团队获取有效客户线索。',
      ] },
    ],
  },
  {
    id: 'projects', company: '项目', kind: 'MAKING', title: '好奇之后，动手试试',
    accent: '#b2513c', badge: 'projects', image: webImage('/assets/pins/project-kit-empty.png'), pinCase: 'projects',
    entries: [
      { id: 'ludlow', pin: { image: webImage('/assets/pins/project-ludlow.png'), outline: 'ludlow' }, art: webImage('/assets/journal/ludlow-courtyard-pencil.png'), title: 'Ludlow Flea', subtitle: '衣服背后，各有主张', place: '纽约 · 学校项目', bullets: [
        '学校项目选了复古服装这个题目。我们走进 Ludlow Flea，分别采访了独立店主 namiah 和 Chris。',
        '采访围绕设计思路和选品展开：两位店主怎样挑衣服，又怎样把各自的喜好和风格带进店里。',
        '比起笼统地说“复古”，我更想知道一件衣服为什么会被选中。这个项目关注的，就是这些具体选择背后的人。',
      ] },
      { id: 'gohire', pin: { image: webImage('/assets/pins/project-gohire.png'), outline: 'gohire' }, art: webImage('/assets/journal/gohire-vibe-coding.png'), title: 'GoHire', subtitle: '我要去码头整点token！', place: '纽约 · 学校项目', bullets: [
        '起点是一份研究报告：先挖掘需求，了解人们怎么选择招聘工具。',
        '然后决定动手做。边自学，边用 vibe coding，把想法变成了 https://www.gohire-us.com。',
      ] },
    ],
  },
  {
    id: 'teaching', company: '支教', kind: 'CONNECTIONS', title: '一些相遇，一直记得',
    accent: '#a64f69', badge: 'teaching', image: webImage('/assets/pins/teaching-notebook.png'),
    entries: [
      { id: 'sanjiang', art: webImage('/assets/journal/sanjiang-memories-friendly.png'), title: '他们喊我“小周老师”', subtitle: '广西三江侗族自治县中朝小学', period: '2020 年 11 月', bullets: [
        '孩子们当向导，带着我穿过田地和小丘，挨家挨户去他们家。',
        '一声声“小周老师”，是这段经历里我一直记得的声音。',
      ] },
      { id: 'ghana', art: webImage('/assets/journal/ghana-dialogue.png'), title: '一本笔记本，轮流说话', subtitle: 'Senior High Technical School For the Deaf', place: 'Akuapim-Mampong, Ghana', period: '2021 年夏天', bullets: [
        '我和同学们的日常聊天，装在一本笔记本里。',
        '每一次聊天就像本地存档似的，希望这些对话能一直保留在我的云端大脑！',
      ] },
    ],
  },
  {
    id: 'life', company: '日常', kind: 'OFF THE CLOCK', title: '认真玩，也往远处走',
    accent: '#52733b', badge: 'life', image: webImage('/assets/pins/life-play.png'),
    entries: [
      { id: 'games', art: webImage('/assets/journal/games.png'), title: 'Work hard, play hard', subtitle: 'CS:GO / 瓦洛兰特 / 英雄联盟 / 骑马与砍杀...', bullets: [
        '从一张封面模糊的光盘开始，从一个无名U盘开始。',
        '射击游戏有意思的地方，是信息、站位和时机总在变化。它是多维的：需要协同与沟通、需要策略与判断、需要运营和思路、需要心态和态度。',
        '“But poetry, beauty, romance, love and GAME”',
      ] },
      { id: 'roadtrip', art: webImage('/assets/journal/road.png'), title: '用双闪说再见', place: '纽约 → 加拿大', bullets: [
        '一段自驾应该怎么走？高速 ✕，山路 ✓',
        '路上总会遇到默契同行的车友。像临时约好了一样，沿着同一条路，陪彼此开了一段。素未谋面，你追我赶。',
        '分路时，他们打了双闪。车灯亮起又熄灭。也算一起走过一段路不是么？',
      ] },
    ],
  },
  {
    id: 'music', company: '音乐', kind: 'ON REPEAT', title: '分你一只耳机',
    accent: '#a65332', badge: 'music', image: webImage('/assets/pins/music-headphones.png'), entries: [],
  },
];

// Apple iTunes catalog metadata verified 2026-09-26. Stream official previews;
// never bundle recordings or imply that previews are full tracks.
export const tracks = [
  { id: 'how-long', art: webImage('/assets/journal/music-forward.png'), title: 'How Long, How Low?', artist: 'Chance Peña / Hayd', mood: '“不妨试着走下去，往哪走都是在往前”',
    preview: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/c5/07/9d/c5079d61-4256-0182-7ec0-5e2ed6b468bf/mzaf_17719841226495227689.plus.aac.p.m4a',
    url: 'https://music.apple.com/us/album/how-long-how-low/1810695263?i=1810695264' },
  { id: 'hongchen', art: webImage('/assets/journal/music-jianghu.png'), title: '红尘客栈', artist: '周杰伦', mood: '“青山不改，绿水长流”',
    preview: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/a1/33/55/a133550f-fa88-daaf-142c-3b7c1302e570/mzaf_11459911195261251726.plus.aac.p.m4a',
    url: 'https://music.apple.com/tw/album/584784193?i=584784305' },
  { id: 'really-like', art: webImage('/assets/journal/music-affection.png'), title: 'I Really Like You', artist: 'Anthem Lights', mood: '“喜欢就是喜欢”',
    preview: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/08/03/7d/08037dc7-b3df-8b61-8257-4ad49b3ff8e9/mzaf_16261888426004684733.plus.aac.p.m4a',
    url: 'https://music.apple.com/us/album/i-really-like-you/6784457859?i=6784458393' },
];
