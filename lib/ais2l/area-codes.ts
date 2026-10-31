/**
 * NANP area code to IANA zone. Toll-free and unlisted codes are omitted on purpose
 * so an unknown number is queued instead of dialed in the office timezone.
 */
const ZONES: Record<string, string> = {};

function add(zone: string, codes: string) {
  for (const code of codes.split(/\s+/)) {
    if (!code) continue;
    const current = ZONES[code];
    if (current && current !== zone) throw new Error(`Area code ${code} is mapped to both ${current} and ${zone}`);
    ZONES[code] = zone;
  }
}

add(
  "America/New_York",
  `201 202 203 207 212 215 216 220 223 229 231 234 239 240 248 252 267 269 272 276
   301 302 304 305 313 315 321 330 332 336 339 347 351 352 380 386 401 404 407 410
   412 413 419 423 434 440 443 445 470 475 478 484 508 513 516 517 518 540 551 561
   567 570 571 585 586 606 607 610 614 617 631 646 667 678 680 689 703 704 706 716
   717 718 724 727 732 734 740 743 754 757 762 770 772 774 781 786 803 804 810 813
   814 828 838 843 845 848 854 856 857 859 860 862 863 864 865 878 904 908 910 912
   914 917 919 929 934 937 941 947 954 959 973 978 980 984
   226 249 289 343 365 416 437 438 450 418 514 519 548 579 581 613 647 705 819 873 905`,
);

add(
  "America/Indiana/Indianapolis",
  "317 463 765 812 930",
);

add(
  "America/Chicago",
  `205 210 214 217 218 219 224 225 228 251 254 256 262 270 281 309 312 314 316 318
   319 320 325 331 334 337 346 361 364 402 405 409 414 417 430 432 447 469 479 501
   504 507 512 515 531 534 539 563 573 580 601 605 608 612 615 618 620 629 630 636
   641 651 660 662 682 701 708 712 713 715 726 731 737 763 769 773 779 785 806 815
   816 817 830 832 847 850 870 872 901 903 913 918 920 931 936 938 940 945 952 956
   972 979 985`,
);

add("America/Denver", "208 303 307 385 406 435 505 575 719 720 801 915 970 986 403 587 780 825 368");

add("America/Phoenix", "480 520 602 623 928");

add(
  "America/Los_Angeles",
  `206 209 213 253 279 310 323 341 360 408 415 424 425 442 458 503 509 510 530 541
   559 562 564 619 626 628 650 657 661 669 702 707 714 725 747 760 775 805 818 831
   858 909 916 925 949 951 971 236 250 604 672 778`,
);

add("America/Anchorage", "907");
add("Pacific/Honolulu", "808");
add("America/Regina", "306 474 639");
add("America/Halifax", "428 506 782 902");
add("America/St_Johns", "709");
add("America/Winnipeg", "204 431 807");

export function zoneForAreaCode(code: string) {
  return ZONES[code] ?? null;
}

export function areaCodeZones() {
  return { ...ZONES };
}
