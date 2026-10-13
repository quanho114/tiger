/**
 * Importers/Callers: Database administrator / migration runner, Node.js CLI script
 * Affected API: Supabase database seed, Edge function public-api/menu, Frontend dish detail modal
 * Data schemas: public.menu_items (description column)
 * User's verbatim instruction: "tui cần bạn research kĩ từng món rồi 1 ít dòng script mô tả món đó khi click vào món đó dc ko bạn" / "update vào web đi"
 */

import fs from 'node:fs';
import { execSync } from 'node:child_process';

export const DISH_DESCRIPTIONS = {
  // 1. GÀ (11 món)
  'Gà nướng muối ớt':
    'Gà ta thả vườn nướng than hoa vàng rộm, thấm đượm muối ớt cay nồng quyện hạt dổi mắc khén Tây Bắc. Lớp da giòn xém, thịt bên trong mềm ngọt mọng nước, chấm muối ớt xanh ăn kèm cơm lam chuẩn vị.',
  'Gà hấp lá chanh':
    'Gà đồi hấp cách thủy cùng lá chanh bánh tẻ thái chỉ, giữ trọn vị ngọt tự nhiên nguyên bản của từng thớ thịt. Da gà vàng ươm giòn sần sật thoảng hương thơm thanh mát, chấm muối tiêu chanh ớt truyền thống.',
  'Gà chiên nước mắm':
    'Thịt gà ta chặt miếng vừa ăn chiên vàng giòn rụm, đảo đều cùng sốt nước mắm nhỉ pha tỏi ớt kẹo sệt đậm đà. Vị mặn ngọt hài hòa, thơm nức mũi mùi tỏi phi, ăn cùng cơm hay nhắm bia đều tròn vị.',
  'Gà xào sả ớt':
    'Thịt gà săn chắc xào lửa lớn cùng sả băm thơm lừng và ớt hiểm cay nồng. Miếng thịt vàng óng ánh ngậy sốt cay the ấm nồng, dậy mùi thơm quyến rũ đặc trưng của gian bếp Việt.',
  'Gà luộc':
    'Gà ta thả vườn luộc chín tới da căng bóng vàng óng, thịt chắc ngọt thanh không bở. Món ăn thanh tao tôn vinh vị ngọt thịt tự nhiên, ăn kèm lá chanh thái nhuyễn và đĩa muối tiêu chanh ớt đỏ tươi.',
  'Gà ủ muối':
    'Gà ta ủ muối thảo mộc hoa mơ giữ trọn nước thịt ngọt ngào, da gà giòn sần sật mọng mướt màu vàng nghệ. Thịt đậm đà thơm ngát mùi thảo mộc núi rừng, chấm sốt ớt đỏ chua ngọt cực kỳ cuốn hút.',
  'Gà xáo măng':
    'Thịt gà đồi xào săn rồi nấu cùng măng le giòn tươi, nước canh ngọt thanh phảng phất vị chua dịu nhẹ và ớt hiểm cay the. Món ăn dân dã ấm bụng, rất thích hợp dùng trong những buổi tụ họp lai rai.',
  'Gà nấu lá giang':
    'Gà ta nấu cùng lá giang rừng vò dập, tạo nên vị nước dùng chua thanh thanh mát họng, giải nhiệt giải ngấy tuyệt vời. Thịt gà ngọt mềm quyện vị chua dịu của lá giang kích thích trọn vẹn vị giác.',
  'Gà nấu cháo':
    'Cháo hạt gạo nở bung mềm sánh nấu từ nước luộc gà béo ngọt tự nhiên, hòa quyện thịt gà ta xé phay, hành hoa và tiêu đen xay nhuyễn. Món ăn bồi bổ ấm lòng, ăn kèm đĩa gỏi bắp cải rau răm giòn mát.',
  'Gà bóp gỏi':
    'Thịt gà luộc xé sợi bóp thấu cùng hành tây giòn ngọt, rau răm thơm nồng, đậu phộng rang giòn và nước mắm chua ngọt pha tỏi ớt. Vị chua cay mặn ngọt bùng nổ, là món khai vị lai rai không thể thiếu.',
  'Gà nấu nấm':
    'Thịt gà đồi ninh cùng các loại nấm tươi ngọt thịt, nước canh ngọt lịm thanh tao tự nhiên giàu dưỡng chất. Vị thanh nhẹ, thơm dịu của nấm hòa quyện cùng vị ngọt của gà ta bồi bổ sức khỏe cả bàn tiệc.',

  // 2. HEO & BÒ (9 món)
  'Sườn nướng Tây Bắc':
    'Dẻ sườn heo dày thịt tẩm ướp sốt hạt dổi, mắc khén và mật ong rừng Tây Bắc, nướng trên than hoa đượm lửa xém vàng rụm. Thịt sườn mềm ngọt đậm vị thảo mộc núi rừng, cắn ngập miếng béo thơm quyến rũ.',
  'Giò heo giả cầy':
    'Chân giò heo thui rơm vàng ươm cạo sạch, ninh kỹ cùng riềng già giã nhỏ, mẻ thanh và mắm tôm nồng đượm. Nước sốt sánh vàng óng ánh, thịt giò béo ngậy giòn sần sật, thơm lừng chuẩn phong vị miền Bắc.',
  'Sườn cháy riềng':
    'Sườn non chặt khúc chiên xém cạnh vàng giòn, đảo bung cùng sợi riềng già giã tơi rang vàng ruộm thơm nức mũi. Vị sườn giòn ngọt đậm đà quyện chút cay cay ấm nồng của riềng lửa, món nhắm rượu đỉnh cao.',
  'Sườn kho':
    'Sườn non chọn lọc kho tộ ngập sốt màu cánh gián sóng sánh, thịt sườn ninh mềm róc xương thấm đượm gia vị tiêu ớt thơm lừng. Vị mặn ngọt béo ngậy đưa cơm, mang đậm hương vị bữa cơm sum vầy.',
  'Dồi trường':
    'Dồi trường heo tươi luộc chín giòn sần sật, trắng nõn nà, ăn cùng hành hoa chần và ớt tươi xắt lát. Chấm cùng mắm tôm đánh sủi bọt hoặc mắm gừng ớt chua cay, giữ trọn độ tươi giòn béo bùi tự nhiên.',
  'Sườn Thái chua cay':
    'Sườn heo ninh mềm róc thịt ngập trong nước dùng súp cay kiểu Thái Lan, phủ ngập tràn ớt xiêm xanh và ngò gai thái nhỏ. Vị chua thanh cay xé lưỡi bùng nổ, càng húp càng mê mẩn kích thích mọi giác quan.',
  'Bò nướng tảng':
    'Thịt thăn bò tơ nguyên tảng ướp sốt nhẹ, nướng trên than hồng vừa chín tới để giữ trọn vẹn nước ngọt nguyên bản bên trong. Thái mỏng từng lát thịt hồng hào mọng mềm, chấm muối kiến vàng hoặc chao ớt.',
  'Bò nhúng giấm / mẻ':
    'Thịt bò tơ thái mỏng tươi rói nhúng trong nồi nước dùng giấm gạo thanh tao hoặc nước mẻ chua dịu đượm sả ớt. Cuốn thịt bò cùng bánh tráng, rau rừng, chuối chát, khế chua rồi chấm mắm nêm đậm đà.',
  'Bò nướng ống tre':
    'Thịt bò ướp tiêu rừng, sả ớt và gia vị núi cao nhồi vào ống tre non nướng trên bếp than hồng. Hơi nóng từ ống tre non tiết ra giữ thịt bò mềm mọng ngọt lịm, thoang thoảng hương tre xanh mộc mạc tinh tế.',

  // 3. HẢI SẢN (23 món)
  'Nghêu hấp sả':
    'Nghêu sống béo múp hấp cùng cọng sả đập dập và ớt hiểm tươi, nghêu vừa hé vỏ chín tới giữ trọn phần nước nghêu ngọt lịm tự nhiên. Vị ấm nồng của sả ớt hòa cùng vị ngọt của biển cả sảng khoái đầu lưỡi.',
  'Nghêu hấp Thái':
    'Nghêu tươi hấp trong sốt Tom Yum chua cay đậm đà, dậy mùi thơm của lá chanh Thái, củ riềng và sả ớt. Nước dùng chua cay cay ngọt ngào húp tới đâu ấm người tới đó, nghêu dai ngọt thấm vị.',
  'Cua nấu bầu':
    'Cua thịt tươi sống chắc nịch nấu cùng trái bầu non thái sợi, nước dùng ngọt lịm thanh mát từ thịt cua và vị ngọt thanh của bầu. Món ăn giải nhiệt dân dã nhưng sang trọng, gạch cua béo ngậy thơm lừng.',
  'Cua sốt me':
    'Cua tươi xào đẫm sốt me chua ngọt sánh kẹo óng ánh, vị chua dịu của me hòa cùng vị ngọt đậm đà của thịt cua biển tươi. Chấm bánh mì cùng nước sốt me sánh mịn là trải nghiệm ẩm thực khó quên.',
  'Cua hấp':
    'Cua biển tươi sống hấp bia cùng sả gừng tươi, giữ trọn vẹn 100% độ săn chắc và vị ngọt tinh khiết tự nhiên của từng thớ thịt cua. Chấm muối tiêu chanh ớt hoặc muối ớt xanh cay nồng cực đã.',
  'Hàu nướng phô mai':
    'Hàu sữa tươi mập mạp phủ ngập lớp sốt phô mai béo ngậy nướng trên than hồng sôi xèo xèo. Phô mai tan chảy kéo sợi dẻo quánh quyện vị ngọt béo mọng sữa của thịt hàu biển tươi ngon.',
  'Hàu nướng mỡ hành':
    'Hàu sữa nướng than hoa rưới đẫm mỡ hành xanh mướt thơm phức, rắc đậu phộng rang giòn bùi và chút hành phi giòn rụm. Vị ngọt béo của hàu hòa quyện vị mằn mặn bùi bùi của mỡ hành truyền thống.',
  'Hàu nướng mọi':
    'Hàu tươi nướng nguyên con trên bếp than hồng không tẩm ướp, nướng chín tới vừa hé miệng giữ trọn nước hàu ngọt mặn mòi hương biển. Chấm muối tiêu chanh hoặc mù tạt cay nồng sảng khoái.',
  'Hàu tái':
    'Hàu sữa sống tươi rói vừa tách vỏ ướp đá lạnh buốt, vắt nước cốt chanh tươi hoặc ăn kèm mù tạt wasabi cay xộc sống mũi. Thịt hàu mềm tan mát lạnh, giữ trọn vẹn độ tươi sống bổ dưỡng nhất.',
  'Tôm nướng muối ớt':
    'Tôm tươi sống xiên que nướng than hồng phết lớp muối ớt đỏ cay the giòn vỏ, thịt tôm bên trong săn chắc ngọt lịm. Vị mặn cay thơm giòn vỏ ngoài quyện thịt tôm tươi ngọt, nhắm cùng bia mát lạnh.',
  'Tôm hấp':
    'Tôm tươi hấp nước dừa hoặc hấp bia sả giữ trọn màu đỏ au bắt mắt và vị ngọt mộc mạc nguyên chất của tôm. Thịt tôm dai giòn ngọt lịm, bóc vỏ chấm muối tiêu chanh thơm lừng.',
  'Tôm chiên xù':
    'Tôm tươi bóc nõn tẩm lớp bột xù chiên vàng ruộm giòn tan, vỏ ngoài xốp giòn rụm bọc lấy thịt tôm ngọt mềm thơm phức bên trong. Chấm cùng sốt tương ớt hoặc sốt mayonnaise béo ngậy.',
  'Tôm sốt me':
    'Tôm tươi xào đảo nhanh tay cùng nước cốt me chua ngọt sánh mịn óng ả, phủ đều từng con tôm bóng bẩy. Vị chua ngọt đậm đà kích thích vị giác, ăn cùng rau thơm và bánh mì rất ngon.',
  'Sò huyết sốt me':
    'Sò huyết tươi xào đẫm sốt me sánh đặc chua ngọt cay dịu, rắc thêm chút đậu phộng bùi bùi và rau răm thơm nồng. Thịt sò giòn béo quyện nước sốt me chua cay, mút vỏ chấm sốt cực kỳ bắt miệng.',
  'Sò huyết hấp sả':
    'Sò huyết tươi hấp nhanh với sả đập dập và ớt chỉ thiên, sò vừa hé miệng giữ trọn dòng nước huyết đỏ tươi ngọt bùi bổ dưỡng. Thịt sò giòn ngọt mọng nước, chấm muối tiêu chanh cay ấm.',
  'Sò huyết cháy tỏi':
    'Sò huyết đảo chảo gang cùng lượng lớn tỏi băm phi vàng giòn rụm thơm nức mũi, áo lớp bơ mặn ngọt beo béo. Từng con sò huyết thấm đượm vị tỏi giòn cay the, nhắm bia lai rai tuyệt hảo.',
  'Sò huyết Lacot':
    'Sò huyết tươi chế biến theo phong cách Lacoste trứ danh: làm chín tái ngập sốt bí truyền chua cay béo ngọt, thịt sò hé miệng mọng nước giữ trọn vẹn phần huyết bổ dưỡng thơm ngọt tự nhiên.',
  'Mực nướng muối ớt':
    'Mực tươi dày mình khía vảy rồng tẩm muối ớt nướng trên than hoa chín vàng thơm nức. Thớ thịt mực giòn sần sật ngọt đậm đà, vị cay the kích thích vị giác chấm tương ớt hoặc muối ớt xanh.',
  'Mực xào sa tế':
    'Mực tươi giòn ngọt xào lửa lớn cùng ớt sa tế cay nồng, hành tây và ớt chuông thanh giòn. Nước sốt sa tế đỏ au cay ấm quyện đều từng miếng mực thơm lừng dậy mùi hấp dẫn.',
  'Mực hấp hành / gừng':
    'Mực tươi làm sạch hấp cách thủy cùng gừng tươi thái sợi và hành hoa chần giòn. Mực chín tới giòn ngọt thanh khiết, ấm nồng vị gừng giải cảm giải lạnh, chấm nước mắm gừng sền sệt.',
  'Mực chiên xù':
    'Khoanh mực dày thịt tẩm lớp bột chiên xù giòn tan rôm rốp, bên trong giữ nguyên độ giòn ngọt mềm mại của mực tươi. Món ăn vặt và nhắm giòn tan thích hợp cho mọi lứa tuổi.',
  'Mực cháy tỏi':
    'Mực tươi chiên vàng xém cạnh đảo đều cùng tỏi phi giòn tan và sốt nước mắm bơ thơm lừng ngậy béo. Từng miếng mực giòn ngọt phủ đầy lớp tỏi phi thơm phức nhai rôm rốp cực kỳ đưa vị.',
  'Ốc nhồi ống tre':
    'Thịt ốc bươu giòn sần sật băm quyện cùng giò sống nấm hương và tiêu hạt, cuộn lá sả tươi nhồi vào ống tre nướng than. Rút lá sả tỏa hương thơm ngát, thịt ốc giòn ngọt chấm mắm gừng sả cay nồng.',

  // 4. CÁ (7 món)
  'Cá lăng nướng muối ớt':
    'Cá lăng sông thịt chắc nạc ít xương tẩm sốt muối ớt rừng nướng trên than hồng xém vàng lớp da béo ngậy. Thịt cá ngọt thơm bùi bùi cuốn bánh tráng rau rừng chấm nước mắm chua ngọt.',
  'Cá lăng kho tộ':
    'Khúc cá lăng dày thịt kho tộ trong nồi đất cùng nước hàng cánh gián, thịt ba chỉ và tiêu sọ cay nồng. Thịt cá béo ngậy săn chắc ngấm đẫm sốt kho sánh đậm, ăn cùng cơm nóng ngon khó cưỡng.',
  'Cá trứng chiên giòn':
    'Cá trứng béo ngậy ôm trọn bụng trứng đầy ắp tẩm bột chiên vàng giòn rụm cả con. Cắn ngập miếng cá giòn tan bùi béo bùng nổ trong khoang miệng, chấm tương ớt hoặc mắm me chua cay.',
  'Cá trứng sốt me':
    'Cá trứng chiên vàng rưới đẫm nước sốt me sánh chua ngọt óng ánh, phủ chút ớt sừng và mè rang thơm bùi. Vị béo ngậy của bụng trứng hòa quyện sốt me chua cay đậm đà tròn vị.',
  'Cá trứng chiên xù':
    'Từng con cá trứng tròn lẳn tẩm lớp bột xù chiên vàng rực giòn tan, nhân bụng trứng bùi ngậy mềm mại. Món nhắm giòn rụm chấm sốt mayonnaise tương ớt rất được thực khách yêu thích.',
  'Cá chạch nướng muối ớt':
    'Cá chạch đồng thịt dai ngọt béo bùi tẩm muối ớt xiêm nướng than hồng thơm phức. Lớp da ngoài xém vàng giòn thơm, thịt cá bùi ngọt tự nhiên chấm muối ớt xanh cay nồng đậm chất đồng quê.',
  'Cá chạch chiên giòn':
    'Cá chạch đồng làm sạch chiên ngập dầu giòn tan cả xương, chấm cùng chén nước mắm me chua cay dẻo quánh. Vị cá giòn rụm béo bùi ăn kèm rau sống là món mồi nhậu trứ danh.',

  // 5. ẾCH & LƯƠN & LE LE (15 món)
  'Ếch nướng muối ớt':
    'Ếch đồng tươi làm sạch tẩm ướp muối ớt cay nồng nướng trên bếp than hoa xèo xèo. Thịt đùi ếch săn chắc ngọt lịm như thịt gà đồi, lớp da nướng giòn rụm cay cay thơm lừng.',
  'Ếch nướng mọi':
    'Ếch đồng nướng mộc mạc trên vỉ than hồng không tẩm ướp cầu kỳ để giữ trọn 100% vị ngọt thanh tinh khiết của thịt ếch tươi. Chấm muối tiêu chanh ớt hoặc muối ớt xanh nồng nàn.',
  'Ếch chiên mắm':
    'Đùi ếch đồng chiên giòn rụm xóc đều sốt nước mắm nhỉ tỏi ớt kẹo dẻo thơm lừng. Miếng ếch óng ánh đậm đà vị mặn ngọt cay nhẹ, thịt bên trong mềm mọng thơm phức mùi tỏi phi.',
  'Ếch chiên giòn':
    'Thịt ếch đồng tẩm bột chiên ngập dầu vàng ươm giòn rụm bên ngoài, bên trong thịt trắng nõn săn chắc ngọt mềm. Chấm kèm tương ớt xí muội chua ngọt, món ăn lai rai hấp dẫn.',
  'Ếch xào sả ớt':
    'Ếch đồng chặt miếng xào lăn lửa lớn cùng củ sả bào sợi, ớt hiểm và hành tây thơm phức. Thịt ếch săn chắc quyện sốt sả ớt cay nồng ấm bụng, rất thích hợp nhắm cùng rượu bia.',
  'Ếch núp lùm':
    'Đùi ếch đồng chiên vàng giòn ngọt ngào được giấu khéo léo dưới lùm "rơm" sả xé sợi tẩm bột chiên vàng óng giòn rụm. Món ăn độc đáo bắt mắt, cắn miếng thịt ếch giòn quyện vị sả thơm lừng.',
  'Ếch um chuối':
    'Ếch đồng xào săn um cùng chuối xanh, đậu hũ chiên vàng và lá lốt tía tô thơm ngát. Nước sốt sánh vàng óng ả béo bùi vị chuối nghệ, thịt ếch ngọt mềm thấm đẫm phong vị dân dã miền quê.',
  'Ếch um cà đắng':
    'Thịt ếch đồng xào săn um cùng quả cà đắng vùng cao và ớt xiêm rừng. Vị nhẫn đắng nhẹ của cà đắng khử sạch tanh, tôn lên vị ngọt thanh của thịt ếch, hậu vị ngọt bùi sâu lắng.',
  'Lươn nướng ống tre':
    'Lươn đồng béo vàng rút xương ướp sả ớt tiêu rừng nhồi vào ống tre tươi nướng than hoa. Thịt lươn chín mềm ngọt béo ngậy thấm đượm hương tre xanh thanh tao, chấm muối ớt chanh chuẩn bài.',
  'Lươn xào sả ớt':
    'Thịt lươn đồng xào lăn cùng sả tươi ớt đỏ và chút bột cà ri thơm lừng. Miếng thịt lươn săn chắc ngậy béo ngập trong vị cay ấm nồng của sả ớt, kích thích vị giác tối đa.',
  'Lươn chiên giòn':
    'Khúc lươn đồng làm sạch tẩm bột mỏng chiên vàng giòn rụm, thịt lươn ngọt đậm bên trong không bị khô xác. Chấm cùng nước mắm me chua ngọt sánh dẻo cay the bắt vị.',
  'Lươn um chuối':
    'Lươn đồng tươi béo um cùng chuối xanh bùi dẻo, đậu hũ mềm ngậy và thịt ba chỉ béo thơm, rắc tía tô lá lốt thái nhỏ. Nước sốt sánh vàng ngậy thơm phức, món ăn bổ dưỡng đậm đà tình quê.',
  'Lươn um cà đắng':
    'Lươn đồng làm sạch nấu um cùng quả cà đắng rừng và ớt hiểm. Vị đắng thanh của cà hòa cùng vị ngọt béo ngậy của lươn đồng tạo nên hương vị đặc sắc, lạ miệng và cực kỳ cuốn hút.',
  'Le le xáo măng':
    'Thịt le le tự nhiên săn chắc ngọt thịt xào săn rồi nấu cùng măng chua giòn rụm. Nước dùng ngọt thanh đậm đà thơm mùi hành hoa và ngò gai, món ăn quý bổ dưỡng cho sức khỏe.',
  'Le le nướng muối ớt':
    'Le le tẩm ướp muối ớt xiêm và gia vị núi rừng nướng than hồng da giòn xém thơm phức. Thịt le le săn chắc bùi béo tự nhiên, vị ngọt đậm đà khác biệt với mọi loại gia cầm khác.',

  // 6. GỎI & RAU (8 món)
  'Gỏi bò hoa chuối':
    'Bắp bò thái mỏng chần tái trộn cùng hoa chuối bánh tẻ bào sợi giòn sần sật, rau thơm và lạc rang bùi béo. Nước trộn chua cay mặn ngọt thấm đều từng sợi hoa chuối giòn mát thanh nhiệt.',
  'Gỏi cà đắng cá khô':
    'Cà đắng vùng cao thái mỏng giòn rụm trộn cùng cá khô nướng xé sợi, rau thơm và nước mắm chua ngọt pha ớt tỏi. Vị đắng thanh nhẹ đầu lưỡi chuyển dần sang ngọt bùi sâu sắc, món nhắm rượu độc đáo.',
  'Gỏi rau má tép đồng':
    'Rau má vườn non xanh mướt giòn tươi trộn cùng tép đồng rang vàng thơm ngậy và nước sốt giấm chua ngọt dịu nhẹ. Món gỏi thanh mát giải nhiệt, bùi bùi giòn rụm giải ngấy tuyệt vời.',
  'Gỏi bắp bò rau thơm':
    'Bắp bò hoa thái mỏng luộc chín tới giòn giòn mềm ngọt, bóp thấu cùng các loại rau thơm rừng, hành tây và đậu phộng. Nước mắm gỏi chua cay đậm đà, tôn trọn vị ngọt ngon của thịt bò tơ.',
  'Rau luộc quẹt':
    'Đĩa rau củ luộc tươi non xanh mướt (bầu, cải ngọt, cà rốt, đậu bắp) giữ trọn độ giòn ngọt tự nhiên. Chấm cùng ốc niêu kho quẹt tôm khô tóp mỡ đậm đà sánh kẹo mặn mặn ngọt ngọt cực hao cơm.',
  'Rau muống luộc':
    'Rau muống đồng cọng xanh non luộc vừa chín tới giữ màu xanh mướt mắt và độ giòn ngọt mát lành. Kèm bát nước luộc rau dầm sấu hoặc vắt chanh chua mát thanh lọc cơ thể.',
  'Rau muống xào bò':
    'Rau muống giòn sần sật xào lửa lớn cùng thịt bò tơ thái mỏng mềm ngọt và tỏi đập dập thơm lừng. Rau giữ màu xanh mướt giòn rụm, thịt bò ngọt mềm thấm đượm gia vị tiêu tỏi.',
  'Khoai tây lắc bơ':
    'Khoai tây chiên vàng giòn rụm bên ngoài bở mềm bên trong, lắc đều cùng bơ thơm béo ngậy và chút muối đường mằn mặn. Món khai vị ăn vặt giòn tan khoái khẩu của cả gia đình.',

  // 7. LẨU (8 món)
  'Lẩu hải sản':
    'Nồi lẩu hải sản đầy ắp tôm tươi, mực giòn, nghêu béo cùng nước dùng chua cay kiểu Thái thơm lừng lá chanh sả ớt. Nước lẩu ngọt lịm từ hải sản tươi sống, ăn kèm bún tươi và rau nấm tươi mát.',
  'Lẩu Thái':
    'Nước lẩu Tom Yum đậm đà chua cay nồng nàn bốc khói nghi ngút, thơm ngát mùi cốt dừa riềng sả. Nhúng ngập tràn thịt bò, tôm mực và rau muống non giòn ngọt, kích thích mọi giác quan.',
  'Lẩu thập cẩm':
    'Nồi lẩu ấm cúng hội tụ đủ đầy thịt bò tơ, sườn heo, tôm mực hải sản và các loại rau củ nấm tươi. Nước dùng ninh xương hầm thanh ngọt tự nhiên, thích hợp cho bàn tiệc sum vầy đông đủ.',
  'Lẩu cá lăng':
    'Cá lăng tươi sống thái khúc dày thịt nấu lẩu măng chua cay dịu dàng. Thịt cá lăng trắng nõn béo ngọt ít xương, nước dùng măng chua thanh dịu ngọt lịm ăn kèm bún tươi và rau chuối.',
  'Lẩu cá bớp':
    'Cá bớp biển tươi rói thịt ngọt béo và lớp da giòn sần sật nấu cùng nước lẩu chua cay măng lá giang. Vị ngọt béo ngậy của cá bớp hòa quyện nước dùng thanh tao thơm ngát ngò gai.',
  'Lẩu cua đồng hải sản':
    'Nồi lẩu riêu cua đồng thơm lừng với tảng riêu cua vàng óng béo ngậy kết hợp cùng tôm tươi, mực giòn và nghêu béo. Nước dùng chua thanh vị giấm bỗng hòa quyện vị ngọt hải sản đậm đà.',
  'Lẩu cua đồng bắp bò':
    'Riêu cua đồng giã tay nổi tảng béo bùi ngậy thơm nước giấm bỗng chua thanh, nhúng từng miếng bắp bò hoa giòn sần sật ngọt mềm. Ăn kèm hoa chuối bào, rau muống và mướp hương thanh mát.',
  'Lẩu tôm':
    'Nồi lẩu đầy ắp tôm sú tươi nhảy tanh tách nhúng vào nước dùng chua ngọt thơm lừng sả ớt. Thịt tôm tươi luộc chín đỏ au săn chắc dai ngọt, nước lẩu ngọt lịm vị tôm tươi tự nhiên.',

  // 8. CƠM · MÌ · MIẾN (9 món)
  'Cơm lam':
    'Gạo nếp nương Tây Bắc dẻo thơm ngâm kỹ nướng chín trong ống nứa non trên than hồng đượm khói. Từng hạt nếp dẻo quánh thoang thoảng hương tre xanh và khói bếp, chấm muối vừng bùi béo.',
  'Cơm chiên trứng':
    'Cơm hạt tơi vàng xốp đảo đều trên chảo gang lửa lớn cùng trứng gà thơm ngậy và hành lá xanh mướt. Đĩa cơm chiên óng ánh vàng ruộm giòn nhẹ bên ngoài mềm thơm bên trong, mộc mạc thơm ngon.',
  'Cơm chiên muối ớt':
    'Hạt cơm chiên giòn tơi lắc đều muối ớt cay the và tỏi phi giòn rụm dậy mùi thơm nức mũi. Vị cay nồng mằn mặn giòn rôm rốp kích thích vị giác, món nhắm lạ miệng đưa bia.',
  'Cơm chiên cá mặn':
    'Cơm chiên hạt tơi xốp hòa quyện cùng cá mặn xé nhuyễn đậm đà, thịt gà xé sợi và tiêu đen cay thơm. Vị mặn mòi đặc trưng của cá khô kết hợp vị béo ngọt của cơm chiên tạo nên hương vị khó quên.',
  'Cơm chiên hải sản':
    'Cơm chiên vàng rộm tơi xốp đảo cùng tôm tươi thái hạt lựu, mực giòn sần sật, trứng gà và đậu Hà Lan thanh mát. Đĩa cơm đầy đặn màu sắc bắt mắt, vị ngọt tự nhiên từ hải sản tươi ngon.',
  'Cơm chiên bò':
    'Hạt cơm chiên săn giòn vàng óng xào cùng thịt bò tơ mềm ngọt và dưa cải chua giòn sần sật. Vị chua dịu của dưa cải hòa cùng vị ngọt của thịt bò tạo nên đĩa cơm chiên hài hòa không hề ngấy.',
  'Mì / Miến xào lòng gà':
    'Sợi mì dai giòn hoặc miến dong dẻo dai xào lửa lớn cùng lòng mề gà giòn sần sật, mộc nhĩ và hành hoa thơm nức. Đĩa mì xào óng ả đậm đà gia vị, rắc tiêu đen thơm lừng ấm nóng.',
  'Mì / Miến xào bò hoặc hải sản':
    'Sợi mì hoặc miến xào săn ngập tràn thịt bò tơ ngọt mềm hoặc tôm mực tươi giòn cùng cải ngọt xanh mướt. Nước sốt xào sánh nhẹ ngấm đượm vào từng sợi mì thơm phức mùi chảo gang.',
  'Mì / Miến xào thập cẩm':
    'Đĩa mì miến xào phong phú nguyên liệu: thịt bò, hải sản tôm mực, lòng gà và các loại rau củ tươi non xào giòn. Món ăn no thịnh soạn, đậm đà màu sắc và hương vị hài hòa thơm ngon.',

  // 9. MÓN PHỤ (4 món)
  'Đậu hũ non hấp hành':
    'Miếng đậu hũ non mềm mịn mượt mà hấp cách thủy cùng hành hoa xanh mướt và nước tương tỏi ớt thơm dịu. Vị béo bùi thanh đạm tan chảy ngay đầu lưỡi, nhẹ nhàng thanh lọc cơ thể.',
  'Đậu hũ non chiên xù':
    'Đậu hũ non bên trong mềm mướt béo ngậy được bọc lớp vỏ bột xù chiên vàng rụm giòn tan rôm rốp. Cắn ngập miếng đậu giòn rụm bên ngoài tan chảy béo mịn bên trong, chấm tương ớt chua ngọt.',
  'Đậu hũ non nướng giấy bạc hải sản':
    'Đậu hũ non mềm mịn xếp trong giấy bạc cùng tôm tươi, mực giòn, nấm và sốt hải sản đậm đà nướng than hoa bốc khói thơm lừng. Đậu hũ ngấm trọn vị ngọt hải sản béo ngậy thơm ngon tuyệt đỉnh.',
  'Combo dồi sụn':
    'Dồi sụn heo nhồi sụn non giòn sần sật, thịt băm và rau thơm nướng trên than hoa vàng ươm xém cạnh thơm phức. Cắn miếng dồi giòn sần sật ngậy béo thơm nồng sả ớt, chấm sốt ớt cay ăn kèm rau húng quế.',

  // 10. ĐỒ UỐNG (4 món rượu)
  'Rượu ba kích':
    'Rượu ngâm củ ba kích tím rừng lâu năm, sắc rượu tím thẫm sóng sánh sang trọng. Vị rượu êm dịu nồng ấm, hậu ngọt thanh thảo mộc sâu lắng, có tác dụng bổ thận tráng dương, kiện gân cốt.',
  'Rượu ba kích đặc biệt':
    'Dòng rượu ba kích rừng tuyển chọn thượng hạng ngâm ủ lâu năm, vị rượu đằm sâu êm mượt không đau đầu. Vị ngọt hậu kéo dài nồng nàn thảo mộc rừng già, tinh hoa ẩm thực vùng cao Tây Bắc.',
  'Rượu Minh Mạng':
    'Toa rượu ngâm theo phương thuốc cung đình hơn 20 vị thảo dược quý (nhân sâm, dâm dương hoắc, đỗ trọng...). Rượu màu hổ phách vị đượm nồng ấm, bồi bổ khí huyết, tăng cường sinh lực dồi dào.',
  'Rượu chuối hột':
    'Rượu nếp cái hoa vàng ngâm cùng chuối hột rừng chín phơi khô nguyên quả. Vị rượu chát nhẹ thanh tao chuyển dần sang ngọt hậu dịu êm, giúp lưu thông khí huyết và hỗ trợ tiêu hóa rất tốt.',
};

export function runUpdate() {
  console.log(`Total descriptions mapped: ${Object.keys(DISH_DESCRIPTIONS).length}/98 dishes.`);

  // Read and update supabase/seed.sql
  let seedContent = fs.readFileSync('supabase/seed.sql', 'utf8');

  let updatedSeedCount = 0;
  for (const [dishName, description] of Object.entries(DISH_DESCRIPTIONS)) {
    const safeName = dishName.replace(/'/g, "''");
    const safeDesc = description.replace(/'/g, "''");

    // Regex to match the dish row in seed.sql:
    // ('uuid', 'catId', 'safeName', 'slug', '', ...)
    const regex = new RegExp(`('${safeName}',\\s*'[^']+',\\s*)''`, 'g');
    if (regex.test(seedContent)) {
      seedContent = seedContent.replace(regex, `$1'${safeDesc}'`);
      updatedSeedCount++;
    } else {
      console.warn(`Could not match in seed.sql: ${dishName}`);
    }
  }

  fs.writeFileSync('supabase/seed.sql', seedContent, 'utf8');
  console.log(`Updated ${updatedSeedCount}/98 dish descriptions in supabase/seed.sql`);

  // Update PostgreSQL database directly
  console.log('Updating PostgreSQL database supabase_db_tiger...');
  let sqlUpdates = 'BEGIN;\n';
  for (const [dishName, description] of Object.entries(DISH_DESCRIPTIONS)) {
    const safeName = dishName.replace(/'/g, "''");
    const safeDesc = description.replace(/'/g, "''");
    sqlUpdates += `UPDATE menu_items SET description = '${safeDesc}' WHERE name = '${safeName}';\n`;
  }
  sqlUpdates += 'COMMIT;\n';

  fs.writeFileSync('/tmp/update_descriptions.sql', sqlUpdates, 'utf8');
  execSync('docker exec -i supabase_db_tiger psql -U postgres -d postgres < /tmp/update_descriptions.sql', { stdio: 'inherit' });
  console.log('PostgreSQL database successfully updated with all 98 dish descriptions!');
}

if (process.argv[1] && process.argv[1].endsWith('update_dish_descriptions.mjs')) {
  runUpdate();
}
