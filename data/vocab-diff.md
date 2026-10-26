# 词表对照：本地词库 vs 新东方四级/六级乱序版

生成时间：2026-10-26 18:18

## 一、规模

| 来源 | 词条数 | 说明 |
|---|---|---|
| 本地词库（合并前 `words.before-pdf-merge.json`） | 5518 | App 原来的「全部」大纲词 |
| 本地词库（合并后 `words.json`） | 6325 | 现在 App 里「全部」的量 |
| 新东方四级乱序版 | 4440 | PDF 共 4448 条，去重后 |
| 新东方六级乱序版 | 2072 | PDF 解析 2074 条（含粘连噪声），修复后 |

## 二、本地词库和这两份表的重合度

| 指标 | 数量 |
|---|---|
| 本地词库中，四级表里也有 | 4421 |
| 本地词库中，只在六级表里（不在四级） | 754 |
| 本地词库中，两份表都没有 | 343 |

## 三、缺词：PDF 有、本地词库没有

- 四级表里有、本地缺：**19** 个
- 六级表里有、本地缺：**799** 个

### 四级缺词（前 200）

```
accommodatio bc esp etc father-in-law ice-cream inser living-room o'clock pm reservior resistanceam so-called systematical up-to-date upside-down well-known world-wide x-ray
```

### 六级缺词（前 200）

```
abbreviation abide absorption adjustable admiration adoption adore advantageous aerospace alas album algebra alignment allied alteration ambient amplitude amusement analogue annually anode antenna applause appreciation ashore ass assassinate assessment astonishment attachment automate availability axial axle bacon bacterium bait balcony bamboo bandit banker banquet barge barley barometer baron baseball bazaar bead beetle bestow beware bishop bitterness blacksmith bleach blond blouse boiler bourgeois bridegroom bridle brightness broaden buddhism buffalo bugle burglar burner bushel butt by-product calculus calibration cane capability capacitance capacitor cape cartridge catalogue catalyst censor charcoal chatter chestnut christ cigar clatter cleanliness clearing clown coefficient coffin coke collaborate colonist combustion commonsense compensation competitor completion complexity composer comprehend compression conceit confirmation conqueror console constitute constraint consul continental correctly correlation corrosion cosmos courageous courteous crab crank crooked cruelty cuckoo curly currently cutter datum deafen dealer dean decidedly decompose decorative decree default deficient deflect deflection deform deformation degradation deliberately dependant deposition deputy derivation desolate dessert destine detain detector deviation devotion devour dictator diesel dioxide disagreement disappearance discourse discrimination disgrace disillusion displacement dissatisfaction distinctly distortion diverge documentary dove dreadful duke dwarf dynamo earthenware eastward economically egyptian electrode elemental elevation elliptical eloquence embroidery emigrate emission enchant endanger energize entreat environmental errand evenly everlasting excel excessively exclamation experimentally
```

## 四、「常用词」这一层的真伪

`common-words.json` 共 138 个词，它们被强制标记为「已斩」且不可斩。

- 其中 **5** 个出现在四级表里、**14** 个出现在六级表里
- 两份表都没有：119 个

四级表里也有、却被强制算作已斩的词：

```
aspect factor issue outcome role
```

六级表里也有、却被强制算作已斩的词：

```
emission kilowatt motorway paper passport peak persist persuasion prevention revenue shortcut subscription systematic unpaid
```


> 基础词（basic-words.json，202 个）里有 183 个也在 PDF 表里。

## 五、本地词库中两份表都没有的词（候选超纲/可疑）

共 343 个，前 300：

```
abrupt accommodation acquisition activate administer adolescent advent adverse aesthetic affiliate afflict agenda aggravate allege alleviate alliance allocate allowance amend amends ample analytic analytical anonymous appraisal apprehension articulate asset assimilate augment authentic authoritative authorize autonomy avert ban batch bias bibliography biography bizarre bleak blunt bonus boom boost bracket brutal buffer bulletin capsule casualty census ceramic certify chaos chat chronic clarity clause clearance coincidence collaboration comet commemorate commentary commitment commute compartment competence concede concise confer configuration conscientious consecutive consensus conserve conspicuous constrain consultant contaminate contemplate contribution contrive controversial converge convict cooperative corporate corps corrode costume counterpart creation crucial cue culminate cumulative curb curriculum curt cynical damn deficit degenerate delta depict depute despatch destined deteriorate diet differentiate diffuse dilemma dilute discrepancy discrete discriminate disposition disrupt distil domain donate dual dubious easter eccentric edible ego elderly elicit eligible elite eloquent embark embed ensue entail entity entrepreneur envisage erroneous erupt esthetic ethics ethnic evoke exempt exotic expend expertise exquisite facet fantasy fax federation foil forbidden format fourteen fraud fringe fusion galaxy gaol gene genetic given guardian guideline guy hearing heritage hierarchy highlight hinder horrible hysterical identity ideology imaginative immune impair imperative imperial impetus implicit incentive incur inflict inhibit insane intact intelligible intensify interim intermittent intersection intimidate intricate intrigue intrinsic intuition invaluable inventory invert irony jeopardize justification layman legitimate literacy mall manoeuvre media mediate medieval merge meridiem militant minimal momentum myth naive narrative nominal obscene odor orthodox paradise paradox paralyze pastime pave pearl pension perfume portray poster precipitate preclude premature premise premium pretext privacy profile prone prospective provocative proximity publicity rating recession recipient recruit rectangular recur recycle redundant remnant renaissance repertoire residential resistance resonance retention retrieve retrospect revelation rig ritual robust rupture sanction saturate savage scared sceptical script scrutiny sector segregate seminar sexual shrewd simulate skeptical slot snatch soar solitary specifically spectacular spouse stabilize stationary statistics
```

## 附：六级 PDF 解析未能确认的 token

```
ndefinite ile twatt propel mishief sitting-room box neighbouring second-hand contend shortcut aerospace vigour by-product offence telex first-rate waggon blond pyjamas xerox
```


## 六、已执行的合并

- 合并前 `data/words.json`：5518 词；合并后：**6325 词**（新增 807）
- 已有词的 id 一个没动，新词从 id 6001 起顺延，所以历史学习进度不受影响；合并前的原文件备份在 `data/words.before-pdf-merge.json`
- 「常用词」层已取消（原 138 词存档于 `data/common-words.retired.json`），这层原先会把 performance / applicant / oversight 这类词强制标成「已斩」
- 音标：四级表自带音标；六级表没有音标，用离线 CMU 词典补，新增的 807 词里 787 个带上了音标