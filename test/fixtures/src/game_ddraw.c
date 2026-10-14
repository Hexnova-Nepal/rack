#include <windows.h>


#include <ddraw.h>
#define DIRECTINPUT_VERSION 0x0800
#include <dinput.h>

int main(void){


DirectDrawCreate(0,0,0);
DirectInput8Create(0,0,0,0,0);

MessageBoxA(0,"x","y",0); return 0; }
