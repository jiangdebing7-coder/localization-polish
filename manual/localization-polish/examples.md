# 润色判断示例

以下分项展示改写思路；实际交付仍须遵循手册，默认汇总为“原文 / 译文 / 优化后译文 / 修改原因”四列验收表，不能因为示例采用分项讲解而只输出建议译文。

以下为中译英示例，用于展示如何兼顾自然表达、原意与格式，不是其他语言的固定模板。其他目标语言应依据当地语法、语域和项目规范判断。

## UI：用自然的操作表达

- 原文：网络连接失败，请检查网络后重试。
- 现译：Network connection failed. Please check the network and try again.
- 建议：Couldn't connect. Check your internet connection and try again.
- 原因：使用常见的用户提示表达，保留失败状态及“检查后重试”的操作。若产品实际指局域网连接，应按上下文调整，不能直接套用 internet。

## 机制：流畅不能改变条件与概率

- 原文：生命值低于 30% 时，受到攻击有 20% 概率恢复 50 点生命值，每 10 秒最多触发一次。
- 问题译文：When HP is below 30%, taking damage restores 50 HP every 10 seconds.
- 建议：While your HP is below 30%, being hit has a 20% chance to restore 50 HP. This can trigger at most once every 10 seconds.
- 原因：补回 20% 概率和触发频率上限，避免被理解为每 10 秒必定回血；“受到攻击”不擅自改成必须造成伤害。若项目对命中、受击有专门定义，遵循机制术语。

## 对白：保留人物态度，不随意加戏

场景：沉稳的队长安抚担心拖累队伍的同伴。

- 原文：别逞强。剩下的交给我们。
- 现译：Don't force yourself to be strong. Leave the rest to us.
- 建议：Don't push yourself. We'll take it from here.
- 原因：用自然台词传达关切与接手行动。不要擅自改成 “Sit down, rookie. The pros have got this.”，这会添加轻蔑态度和身份关系。

## 营销：可以重组意象，不能增加承诺

- 原文：随时开启冒险，探索未知世界。
- 现译：Open an adventure at any time and explore an unknown world.
- 建议：Adventure awaits. Explore a world of discovery whenever you're ready.
- 原因：重组搭配与节奏，保留探索和随时开始的意图。不添加 “Play offline for free” 等原文没有的功能或价格承诺。

## 占位符：次数相同也可能出错

基线：`Give %s to %s`，引擎依次传入“物品”和“接收者”。

改成 `For %s: %s` 会把物品放在接收者的位置。两个 `%s` 的数量相同，核验器仍会返回 `same_count`，但显示含义已经错误。应保留参数角色；仅在确认引擎支持索引参数后，才考虑使用该引擎的合法语法调整顺序。

`{item}`、`{recipient}` 等命名变量也不能仅凭外观就假定允许换位，应以项目格式规则为准。

## 仅有译文：改善表达，不反推事实

- 现译：You can receive reward after finish task.
- 建议：You can claim the reward after completing the task.
- 原因：修正冠词与动词形式。没有原文时，不能确认奖励是单个还是多个、是否自动发放，也不能添加 “daily” 或 “guaranteed”。若领取方式会影响操作理解，应确认 claim 是否符合产品上下文。

## 已经自然：允许保持不变

- 原文：保存更改？
- 现译：Save changes?
- 建议：Save changes?
- 原因：含义准确、简洁且符合常见 UI 用语，无需为了体现工作量而改写。


## 最终文件中的逐条原因示例

已有三列“法语原文 / 原中文译文 / 润色后中文”时，直接新增第四列“修改原因”。以下为独立演示数据，不是对用户截图中不可见内容的还原。

| 法语原文 | 原中文译文 | 润色后中文 | 修改原因 |
| --- | --- | --- | --- |
| Barbare | 野蛮人 | 野蛮人 | 无需修改 |
| Veuillez réessayer plus tard. | 请更晚再试。 | 请稍后重试。 | “更晚” → “稍后”：此处 plus tard 表示过一段时间后，使用中文提示语的自然时间表达；“再试” → “重试”：采用常见操作提示用语。 |
| Enregistrez les modifications avant de quitter. | 退出后保存更改。 | 退出前保存更改。 | “退出后” → “退出前”：avant de quitter 表示退出之前，修正操作顺序的误译。 |

不合格的第四列：空白、“已优化”、“整体调整了语气和表达”、“同上”，或者为所有改动行复制同一个泛泛理由。未修改行可以重复填写“无需修改”，因为这明确标明该行没有改动。
