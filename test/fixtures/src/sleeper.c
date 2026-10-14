#include <windows.h>
#include <stdio.h>
int WINAPI WinMain(HINSTANCE a, HINSTANCE b, LPSTR cmd, int show) {
  FILE *f = fopen("args.txt", "w"); if (f) { fputs(cmd, f); fclose(f); }
  Sleep(8000); return 0;
}
