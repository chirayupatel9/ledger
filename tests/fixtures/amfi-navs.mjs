// Rows from AMFI's NAVAll.txt (October 2026 layout, CRLF line endings), plus a few malformed ones and the older six-column layout.
const rows=`Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)

HDFC Mutual Fund

118955;INF179K01UT0;-;HDFC Flexi Cap Fund;Direct Plan;Growth Option;2162.161;19-Oct-2026
101762;INF179K01608;-;HDFC Flexi Cap Fund;Regular Plan;Growth Option;1961.801;19-Oct-2026
118954;INF179K01VL5;INF179K01VM3;HDFC Flexi Cap Fund;Direct Plan;IDCW Option;87.425;19-Oct-2026
101763;INF179K01582;INF179K01590;HDFC Flexi Cap Fund;Regular Plan;IDCW Option;70.891;19-Oct-2026

PPFAS Mutual Fund

122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth;90.3546;19-Oct-2026
153964;-;INF879O01308;Parag Parikh Flexi Cap Fund;Direct Plan;Monthly IDCW Payout;90.3546;19-Oct-2026
122640;INF879O01019;-;Parag Parikh Flexi Cap Fund;Regular Plan;Growth;82.2629;19-Oct-2026
153965;-;INF879O01324;Parag Parikh Flexi Cap Fund;Regular Plan;Monthly IDCW Payout;82.2629;19-Oct-2026

Open Ended Schemes(Equity Scheme - Large Cap Fund)

ICICI Prudential Mutual Fund

108466;INF109K01BL4;-;ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund);Regular Plan;Growth;102.65;19-Oct-2026
120586;INF109K016L0;-;ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund);Direct Plan;Growth;113.48;19-Oct-2026

Open Ended Schemes(Equity Scheme - Mid Cap Fund)

Motilal Oswal Mutual Fund

127044;INF247L01460;INF247L01452;Motilal Oswal Midcap Fund;;;46.4616;19-Oct-2026
127042;INF247L01445;-;Motilal Oswal Midcap Fund;;;113.9108;19-Oct-2026
127040;INF247L01437;INF247L01429;Motilal Oswal Midcap Fund;;;44.4990;19-Oct-2026
127039;INF247L01411;-;Motilal Oswal Midcap Fund;;;98.4713;19-Oct-2026

Open Ended Schemes(Debt Scheme - Liquid Fund)

PPFAS Mutual Fund

143263;-;INF879O01118;Parag Parikh Liquid Fund;Direct Plan;Daily Reinvestment of IDCW;1000.5405;20-Oct-2026
143262;INF879O01076;INF879O01084;Parag Parikh Liquid Fund;Direct Plan;Monthly IDCW Payout;1006.5438;20-Oct-2026
143265;-;INF879O01134;Parag Parikh Liquid Fund;Direct Plan;Weekly Reinvestment of IDCW;1001.1715;20-Oct-2026

Open Ended Schemes(Solution Oriented Scheme - Children’s Fund)

Axis Mutual Fund

135762;INF846K01WO1;-;Axis Children's Fund;Direct Plan;Growth Option;29.1407;19-Oct-2026
135764;INF846K01WR4;-;Axis Children's Fund;Direct Plan;Growth Option;29.6980;19-Oct-2026
120503;INF846K01EW2;-;Axis ELSS- Tax Saver Fund;Direct Plan;Growth Option;105.8554;19-Oct-2026
112323;INF846K01131;-;Axis ELSS- Tax Saver Fund;Regular Plan;Growth Option;92.8872;19-Oct-2026
112323;INF846K01131;-;Axis ELSS- Tax Saver Fund;Regular Plan;Growth Option;80.1000;02-Jan-2026
120448;INF846K01DF9;INF846K01DE2;Axis Gilt Fund;Direct Plan;Half Yearly IDCW Option;12.1935;19-Oct-2026
120449;INF846K01DG7;INF846K01DH5;Axis Gilt Fund;Direct Plan;Regular IDCW Option;9.8714;19-Oct-2026
116470;INF846K01CK1;INF846K01CL9;Axis Gilt Fund;Regular Plan;Regular IDCW Option;9.8646;19-Oct-2026
999001;INF000X00001;-;Matured Fixed Term Plan;;;N.A.;19-Oct-2026
999002;-;-;Wound Up Fund;Regular Plan;Growth;0;19-Oct-2026
999003;-;-;Bad Date Fund;Regular Plan;Growth;10.5;2026-10-19
`;
export const navFile=rows.replace(/\n/g,'\r\n');
export const oldNavFile=`Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)

PPFAS Mutual Fund

122639;INF879O01027;-;Parag Parikh Flexi Cap Fund - Direct Plan - Growth;84.1022;17-Oct-2025
122640;INF879O01019;-;Parag Parikh Flexi Cap Fund - Regular Plan - Growth;77.0311;17-Oct-2025
`;
