/**
 * Mark (MARD) 色号数据
 * 从 colorSystemMapping.json 提取
 * 共 291 种标准颜色
 */

const colorMapping = {
  "#FAF4C8": { MARD: "A1" }, "#FFFFD5": { MARD: "A2" }, "#FEFF8B": { MARD: "A3" },
  "#FBED56": { MARD: "A4" }, "#F4D738": { MARD: "A5" }, "#FEAC4C": { MARD: "A6" },
  "#FE8B4C": { MARD: "A7" }, "#FFDA45": { MARD: "A8" }, "#FF995B": { MARD: "A9" },
  "#F77C31": { MARD: "A10" }, "#FFDD99": { MARD: "A11" }, "#FE9F72": { MARD: "A12" },
  "#FFC365": { MARD: "A13" }, "#FD543D": { MARD: "A14" }, "#FFF365": { MARD: "A15" },
  "#FFFF9F": { MARD: "A16" }, "#FFE36E": { MARD: "A17" }, "#FEBE7D": { MARD: "A18" },
  "#FD7C72": { MARD: "A19" }, "#FFD568": { MARD: "A20" }, "#FFE395": { MARD: "A21" },
  "#F4F57D": { MARD: "A22" }, "#E6C9B7": { MARD: "A23" }, "#F7F8A2": { MARD: "A24" },
  "#FFD67D": { MARD: "A25" }, "#FFC830": { MARD: "A26" }, "#E6EE31": { MARD: "B1" },
  "#63F347": { MARD: "B2" }, "#9EF780": { MARD: "B3" }, "#5DE035": { MARD: "B4" },
  "#35E352": { MARD: "B5" }, "#65E2A6": { MARD: "B6" }, "#3DAF80": { MARD: "B7" },
  "#1C9C4F": { MARD: "B8" }, "#27523A": { MARD: "B9" }, "#95D3C2": { MARD: "B10" },
  "#5D722A": { MARD: "B11" }, "#166F41": { MARD: "B12" }, "#CAEB7B": { MARD: "B13" },
  "#ADE946": { MARD: "B14" }, "#2E5132": { MARD: "B15" }, "#C5ED9C": { MARD: "B16" },
  "#9BB13A": { MARD: "B17" }, "#E6EE49": { MARD: "B18" }, "#24B88C": { MARD: "B19" },
  "#C2F0CC": { MARD: "B20" }, "#156A6B": { MARD: "B21" }, "#0B3C43": { MARD: "B22" },
  "#303A21": { MARD: "B23" }, "#EEFCA5": { MARD: "B24" }, "#4E846D": { MARD: "B25" },
  "#8D7A35": { MARD: "B26" }, "#CCE1AF": { MARD: "B27" }, "#9EE5B9": { MARD: "B28" },
  "#C5E254": { MARD: "B29" }, "#E2FCB1": { MARD: "B30" }, "#B0E792": { MARD: "B31" },
  "#9CAB5A": { MARD: "B32" }, "#E8FFE7": { MARD: "C1" }, "#A9F9FC": { MARD: "C2" },
  "#A0E2FB": { MARD: "C3" }, "#41CCFF": { MARD: "C4" }, "#01ACEB": { MARD: "C5" },
  "#50AAF0": { MARD: "C6" }, "#3677D2": { MARD: "C7" }, "#0F54C0": { MARD: "C8" },
  "#324BCA": { MARD: "C9" }, "#3EBCE2": { MARD: "C10" }, "#28DDDE": { MARD: "C11" },
  "#1C334D": { MARD: "C12" }, "#CDE8FF": { MARD: "C13" }, "#D5FDFF": { MARD: "C14" },
  "#22C4C6": { MARD: "C15" }, "#1557A8": { MARD: "C16" }, "#04D1F6": { MARD: "C17" },
  "#1D3344": { MARD: "C18" }, "#1887A2": { MARD: "C19" }, "#176DAF": { MARD: "C20" },
  "#BEDDFF": { MARD: "C21" }, "#67B4BE": { MARD: "C22" }, "#C8E2FF": { MARD: "C23" },
  "#7CC4FF": { MARD: "C24" }, "#A9E5E5": { MARD: "C25" }, "#3CAED8": { MARD: "C26" },
  "#D3DFFA": { MARD: "C27" }, "#BBCFED": { MARD: "C28" }, "#34488E": { MARD: "C29" },
  "#AEB4F2": { MARD: "D1" }, "#858EDD": { MARD: "D2" }, "#2F54AF": { MARD: "D3" },
  "#182A84": { MARD: "D4" }, "#B843C5": { MARD: "D5" }, "#AC7BDE": { MARD: "D6" },
  "#8854B3": { MARD: "D7" }, "#E2D3FF": { MARD: "D8" }, "#D5B9F8": { MARD: "D9" },
  "#361851": { MARD: "D10" }, "#B9BAE1": { MARD: "D11" }, "#DE9AD4": { MARD: "D12" },
  "#B90095": { MARD: "D13" }, "#8B279B": { MARD: "D14" }, "#2F1F90": { MARD: "D15" },
  "#E3E1EE": { MARD: "D16" }, "#C4D4F6": { MARD: "D17" }, "#A45EC7": { MARD: "D18" },
  "#D8C3D7": { MARD: "D19" }, "#9C32B2": { MARD: "D20" }, "#9A009B": { MARD: "D21" },
  "#333A95": { MARD: "D22" }, "#EBDAFC": { MARD: "D23" }, "#7786E5": { MARD: "D24" },
  "#494FC7": { MARD: "D25" }, "#DFC2F8": { MARD: "D26" }, "#FDD3CC": { MARD: "E1" },
  "#FEC0DF": { MARD: "E2" }, "#FFB7E7": { MARD: "E3" }, "#E8649E": { MARD: "E4" },
  "#F551A2": { MARD: "E5" }, "#F13D74": { MARD: "E6" }, "#C63478": { MARD: "E7" },
  "#FFDBE9": { MARD: "E8" }, "#E970CC": { MARD: "E9" }, "#D33793": { MARD: "E10" },
  "#FCDDD2": { MARD: "E11" }, "#F78FC3": { MARD: "E12" }, "#B5006D": { MARD: "E13" },
  "#FFD1BA": { MARD: "E14" }, "#F8C7C9": { MARD: "E15" }, "#FFF3EB": { MARD: "E16" },
  "#FFE2EA": { MARD: "E17" }, "#FFC7DB": { MARD: "E18" }, "#FEBAD5": { MARD: "E19" },
  "#D8C7D1": { MARD: "E20" }, "#BD9DA1": { MARD: "E21" }, "#B785A1": { MARD: "E22" },
  "#937A8D": { MARD: "E23" }, "#E1BCE8": { MARD: "E24" }, "#FD957B": { MARD: "F1" },
  "#FC3D46": { MARD: "F2" }, "#F74941": { MARD: "F3" }, "#FC283C": { MARD: "F4" },
  "#E7002F": { MARD: "F5" }, "#943630": { MARD: "F6" }, "#971937": { MARD: "F7" },
  "#BC0028": { MARD: "F8" }, "#E2677A": { MARD: "F9" }, "#8A4526": { MARD: "F10" },
  "#5A2121": { MARD: "F11" }, "#FD4E6A": { MARD: "F12" }, "#F35744": { MARD: "F13" },
  "#FFA9AD": { MARD: "F14" }, "#D30022": { MARD: "F15" }, "#FEC2A6": { MARD: "F16" },
  "#E69C79": { MARD: "F17" }, "#D37C46": { MARD: "F18" }, "#C1444A": { MARD: "F19" },
  "#CD9391": { MARD: "F20" }, "#F7B4C6": { MARD: "F21" }, "#FDC0D0": { MARD: "F22" },
  "#F67E66": { MARD: "F23" }, "#E698AA": { MARD: "F24" }, "#E54B4F": { MARD: "F25" },
  "#FFE2CE": { MARD: "G1" }, "#FFC4AA": { MARD: "G2" }, "#F4C3A5": { MARD: "G3" },
  "#E1B383": { MARD: "G4" }, "#EDB045": { MARD: "G5" }, "#E99C17": { MARD: "G6" },
  "#9D5B3E": { MARD: "G7" }, "#753832": { MARD: "G8" }, "#E6B483": { MARD: "G9" },
  "#D98C39": { MARD: "G10" }, "#E0C593": { MARD: "G11" }, "#FFC890": { MARD: "G12" },
  "#B7714A": { MARD: "G13" }, "#8D614C": { MARD: "G14" }, "#FCF9E0": { MARD: "G15" },
  "#F2D9BA": { MARD: "G16" }, "#78524B": { MARD: "G17" }, "#FFE4CC": { MARD: "G18" },
  "#E07935": { MARD: "G19" }, "#A94023": { MARD: "G20" }, "#B88558": { MARD: "G21" },
  "#FDFBFF": { MARD: "H1" }, "#FEFFFF": { MARD: "H2" }, "#B6B1BA": { MARD: "H3" },
  "#89858C": { MARD: "H4" }, "#48464E": { MARD: "H5" }, "#2F2B2F": { MARD: "H6" },
  "#000000": { MARD: "H7" }, "#E7D6DB": { MARD: "H8" }, "#EDEDED": { MARD: "H9" },
  "#EEE9EA": { MARD: "H10" }, "#CECDD5": { MARD: "H11" }, "#FFF5ED": { MARD: "H12" },
  "#F5ECD2": { MARD: "H13" }, "#CFD7D3": { MARD: "H14" }, "#98A6A8": { MARD: "H15" },
  "#1D1414": { MARD: "H16" }, "#F1EDED": { MARD: "H17" }, "#FFFDF0": { MARD: "H18" },
  "#F6EFE2": { MARD: "H19" }, "#949FA3": { MARD: "H20" }, "#FFFBE1": { MARD: "H21" },
  "#CACAD4": { MARD: "H22" }, "#9A9D94": { MARD: "H23" }, "#BCC6B8": { MARD: "M1" },
  "#8AA386": { MARD: "M2" }, "#697D80": { MARD: "M3" }, "#E3D2BC": { MARD: "M4" },
  "#D0CCAA": { MARD: "M5" }, "#B0A782": { MARD: "M6" }, "#B4A497": { MARD: "M7" },
  "#B38281": { MARD: "M8" }, "#A58767": { MARD: "M9" }, "#C5B2BC": { MARD: "M10" },
  "#9F7594": { MARD: "M11" }, "#644749": { MARD: "M12" }, "#D19066": { MARD: "M13" },
  "#C77362": { MARD: "M14" }, "#757D78": { MARD: "M15" }, "#FCF7F8": { MARD: "P1" },
  "#B0A9AC": { MARD: "P2" }, "#AFDCAB": { MARD: "P3" }, "#FEA49F": { MARD: "P4" },
  "#EE8C3E": { MARD: "P5" }, "#5FD0A7": { MARD: "P6" }, "#EB9270": { MARD: "P7" },
  "#F0D958": { MARD: "P8" }, "#D9D9D9": { MARD: "P9" }, "#D9C7EA": { MARD: "P10" },
  "#F3ECC9": { MARD: "P11" }, "#E6EEF2": { MARD: "P12" }, "#AACBEF": { MARD: "P13" },
  "#337680": { MARD: "P14" }, "#668575": { MARD: "P15" }, "#FEBF45": { MARD: "P16" },
  "#FEA324": { MARD: "P17" }, "#FEB89F": { MARD: "P18" }, "#FFFEEC": { MARD: "P19" },
  "#FEBECF": { MARD: "P20" }, "#ECBEBF": { MARD: "P21" }, "#E4A89F": { MARD: "P22" },
  "#A56268": { MARD: "P23" }, "#F2A5E8": { MARD: "Q1" }, "#E9EC91": { MARD: "Q2" },
  "#FFFF00": { MARD: "Q3" }, "#FFEBFA": { MARD: "Q4" }, "#76CEDE": { MARD: "Q5" },
  "#D50D21": { MARD: "R1" }, "#F92F83": { MARD: "R2" }, "#FD8324": { MARD: "R3" },
  "#F8EC31": { MARD: "R4" }, "#35C75B": { MARD: "R5" }, "#238891": { MARD: "R6" },
  "#19779D": { MARD: "R7" }, "#1A60C3": { MARD: "R8" }, "#9A56B4": { MARD: "R9" },
  "#FFDB4C": { MARD: "R10" }, "#FFEBFB": { MARD: "R11" }, "#D8D5CE": { MARD: "R12" },
  "#55514C": { MARD: "R13" }, "#9FE4DF": { MARD: "R14" }, "#77CEE9": { MARD: "R15" },
  "#3ECFCA": { MARD: "R16" }, "#4A867A": { MARD: "R17" }, "#7FCD9D": { MARD: "R18" },
  "#CDE55D": { MARD: "R19" }, "#E8C7B4": { MARD: "R20" }, "#AD6F3C": { MARD: "R21" },
  "#6C372F": { MARD: "R22" }, "#FEB872": { MARD: "R23" }, "#F3C1C0": { MARD: "R24" },
  "#C9675E": { MARD: "R25" }, "#D293BE": { MARD: "R26" }, "#EA8CB1": { MARD: "R27" },
  "#9C87D6": { MARD: "R28" }, "#FFFFFF": { MARD: "T1" }, "#FD6FB4": { MARD: "Y1" },
  "#FEB481": { MARD: "Y2" }, "#D7FAA0": { MARD: "Y3" }, "#8BDBFA": { MARD: "Y4" },
  "#E987EA": { MARD: "Y5" }, "#DAABB3": { MARD: "ZG1" }, "#D6AA87": { MARD: "ZG2" },
  "#C1BD8D": { MARD: "ZG3" }, "#96869F": { MARD: "ZG4" }, "#8490A6": { MARD: "ZG5" },
  "#94BFE2": { MARD: "ZG6" }, "#E2A9D2": { MARD: "ZG7" }, "#AB91C0": { MARD: "ZG8" }
};

/**
 * 将十六进制颜色转换为 RGB 对象
 * @param {string} hex - 十六进制颜色值 (#RRGGBB 或 #RGB)
 * @returns {{r: number, g: number, b: number}} RGB 对象
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    };
  }
  // 处理 3 位简写
  const shortResult = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (shortResult) {
    return {
      r: parseInt(shortResult[1] + shortResult[1], 16),
      g: parseInt(shortResult[2] + shortResult[2], 16),
      b: parseInt(shortResult[3] + shortResult[3], 16)
    };
  }
  return { r: 0, g: 0, b: 0 };
}

/**
 * 创建 Mark 色号调色板数组
 * @returns {Array<{code: string, hex: string, rgb: {r: number, g: number, b: number}}>}
 */
function createMarkPalette() {
  const palette = [];
  for (const [hex, brands] of Object.entries(colorMapping)) {
    if (brands.MARD) {
      palette.push({
        code: brands.MARD,
        hex: hex.toUpperCase(),
        rgb: hexToRgb(hex)
      });
    }
  }
  return palette;
}

// 导出调色板
const markPalette = createMarkPalette();

module.exports = {
  markPalette,
  colorMapping,
  hexToRgb
};
